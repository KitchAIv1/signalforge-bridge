/**
 * Omega Trail v1 live execution — single order, direction-specific SL, 0.5R trail.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalInsertPayload } from '../connectors/supabase.js';
import type { BridgeConfig, BridgeEngineRow } from '../types/config.js';
import type { ActiveRegimeState } from '../services/RegimeStateService.js';
import type { ActiveAmdState } from '../services/amdDetector/amdStateService.js';
import { placeMarketOrderWithRebuildBoundsRetry } from './rebuildBoundsRetryOrder.js';
import { computeTrailInsertFields } from '../monitoring/trailingStopSupport.js';
import { sendTradeExecutedAlert } from '../services/telegram/alertTradeExecution.js';
import { logError, logInfo, logWarn } from '../utils/logger.js';
import type { ValidationResult } from './signalValidation.js';
import type { DecisionType } from '../types/signals.js';

type RouterNormalizedSignal = NonNullable<ValidationResult['normalized']>;

type TradeLogBuilder = (
  payload: SignalInsertPayload,
  decision: DecisionType,
  blockReason: string | null,
  decisionLatencyMs: number,
  equity: number | null,
  openTradeCount: number,
  instrument: string,
  direction?: string,
) => Record<string, unknown>;

type AuditAttacher = (
  row: Record<string, unknown>,
  regimeState: ActiveRegimeState | null,
  regimeSizeMultiplier: number,
  amdState: ActiveAmdState | null,
  directionMode: string,
) => void;

export interface OmegaTrailV1ExecutionDeps {
  supabase: SupabaseClient;
  payload: SignalInsertPayload;
  norm: RouterNormalizedSignal;
  finalUnits: number;
  signalId: string;
  config: BridgeConfig;
  engine: BridgeEngineRow;
  decisionLatencyMs: number;
  cachedAccountEquity: number | null;
  openTradeCount: number;
  regimeState: ActiveRegimeState | null;
  regimeSizeMultiplier: number;
  amdState: ActiveAmdState | null;
  directionMode: string;
  buildTradeLogRow: TradeLogBuilder;
  attachOmegaAuditFields: AuditAttacher;
}

function mirrorStructureStop(
  fillPrice: number,
  signalEntry: number,
  signalStopLoss: number,
  direction: string,
): number {
  const signalRSize = Math.abs(signalEntry - signalStopLoss);
  return direction === 'SHORT' ? fillPrice + signalRSize : fillPrice - signalRSize;
}

async function registerTrailState(
  supabase: SupabaseClient,
  rowRecord: Record<string, unknown>,
  tradeId: string,
  fillPrice: number,
  signalId: string,
): Promise<void> {
  rowRecord.fill_price = fillPrice;
  const trailMetrics = computeTrailInsertFields(rowRecord);
  if (!trailMetrics) {
    logError('[Omega TrailV1] Trail metrics unavailable — trade monitor will retry', {
      tradeId,
      signalId,
    });
    return;
  }
  const { error: trailInsErr } = await supabase.from('trail_stop_state').insert({
    oanda_trade_id: tradeId,
    engine_id: rowRecord.engine_id,
    pair: rowRecord.pair,
    direction: String(rowRecord.direction ?? '').toLowerCase(),
    entry_price: fillPrice,
    sl_distance: trailMetrics.slDistance,
    trail_distance: trailMetrics.trailDistance,
    r_size_raw: trailMetrics.rSizeRaw,
    peak_favorable: 0,
    trail_activated: false,
    activation_threshold: trailMetrics.activationThreshold,
  });
  if (trailInsErr) {
    logError('[Omega TrailV1] Trail state registration failed — trade monitor will retry', {
      tradeId,
      error: trailInsErr.message,
    });
    return;
  }
  logInfo('[Omega TrailV1] Trail state registered in-loop', { tradeId, signalId });
}

export async function executeOmegaTrailV1Order(deps: OmegaTrailV1ExecutionDeps): Promise<void> {
  const {
    supabase,
    payload,
    norm,
    finalUnits,
    signalId,
    config,
    engine,
    decisionLatencyMs,
    cachedAccountEquity,
    openTradeCount,
    regimeState,
    regimeSizeMultiplier,
    amdState,
    directionMode,
    buildTradeLogRow,
    attachOmegaAuditFields,
  } = deps;

  const { orderResult } = await placeMarketOrderWithRebuildBoundsRetry({
    norm,
    finalUnits,
    useTrailStop: true,
    maxOrderTimeoutMs: config.maxOrderTimeoutMs,
    rebuildBoundsRetryEnabled: false,
  });

  if (orderResult.orderCancelTransaction) {
    const cancelReason = orderResult.orderCancelTransaction.reason ?? 'Order cancelled';
    await supabase.from('bridge_trade_log').insert({
      ...buildTradeLogRow(
        payload,
        'BLOCKED',
        cancelReason,
        decisionLatencyMs,
        cachedAccountEquity,
        openTradeCount,
        norm.oandaInstrument,
      ),
      units: finalUnits,
    });
    return;
  }

  const fillTx = orderResult.orderFillTransaction;
  const tradeId = fillTx?.tradeOpened?.tradeID ?? fillTx?.id;
  const filledUnits = fillTx?.units != null ? Number(fillTx.units) : finalUnits;
  const fillPrice = fillTx?.price != null ? Number(fillTx.price) : null;

  const row = buildTradeLogRow(
    payload,
    'EXECUTED',
    null,
    decisionLatencyMs,
    cachedAccountEquity,
    openTradeCount,
    norm.oandaInstrument,
    norm.direction,
  );
  const rowRecord = row as Record<string, unknown>;
  rowRecord.oanda_order_id = fillTx?.id;
  rowRecord.oanda_trade_id = tradeId;
  rowRecord.units = filledUnits;
  if (fillPrice != null) {
    rowRecord.fill_price = fillPrice;
    rowRecord.stop_loss = mirrorStructureStop(
      fillPrice,
      norm.entryPrice,
      norm.stopLoss,
      norm.direction,
    );
  }

  attachOmegaAuditFields(rowRecord, regimeState, regimeSizeMultiplier, amdState, directionMode);

  const { error: insertError } = await supabase.from('bridge_trade_log').insert(row);
  if (insertError) {
    logError('[Omega TrailV1] bridge_trade_log insert failed', {
      tradeId,
      error: insertError.message,
    });
    return;
  }

  if (tradeId && fillPrice != null) {
    rowRecord.engine_id = norm.engineId;
    rowRecord.pair = norm.oandaInstrument;
    rowRecord.direction = norm.direction;
    await registerTrailState(supabase, rowRecord, tradeId, fillPrice, signalId);
  }

  const { data: eng } = await supabase
    .from('bridge_engines')
    .select('trades_today')
    .eq('engine_id', norm.engineId)
    .single();
  const newCount =
    ((eng as { trades_today?: number } | null)?.trades_today ?? engine.trades_today) + 1;
  await supabase
    .from('bridge_engines')
    .update({ trades_today: newCount, updated_at: new Date().toISOString() })
    .eq('engine_id', norm.engineId);

  logInfo('Omega Trail v1 trade executed', {
    signalId,
    pair: norm.oandaInstrument,
    units: filledUnits,
    tradeId,
  });

  void sendTradeExecutedAlert({
    oandaInstrument: norm.oandaInstrument,
    direction: norm.direction,
    fillPrice,
    stopLoss: typeof rowRecord.stop_loss === 'number' ? (rowRecord.stop_loss as number) : null,
    takeProfit: payload.take_profit ?? payload.target_1 ?? null,
    filledUnits,
    amdTag: amdState?.amdTag ?? null,
    amdSizeMultiplier: amdState?.amdSizeMultiplier ?? null,
    directionSource: directionMode === 'auto' ? 'auto' : 'manual',
    engineId: norm.engineId,
  }).catch(() => {});

  if (!tradeId || fillPrice == null) {
    logWarn('[Omega TrailV1] Executed without trade id or fill price', { signalId });
  }
}
