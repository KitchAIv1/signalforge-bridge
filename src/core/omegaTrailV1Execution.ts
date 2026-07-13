/**
 * Omega Trail v1 live execution — single order, direction-specific SL.
 * Trail lock: bridge_config omega_trail_peak_giveback_pips (default 1.5p) or legacy 0.5R.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalInsertPayload } from '../connectors/supabase.js';
import type { BridgeConfig, BridgeEngineRow } from '../types/config.js';
import type { ActiveRegimeState } from '../services/RegimeStateService.js';
import type { ActiveAmdState } from '../services/amdDetector/amdStateService.js';
import type { BrokerClient } from '../connectors/broker/types.js';
import { placeMarketOrderViaBroker } from '../services/broker/brokerMarketOrder.js';
import { computeTrailInsertFields } from '../monitoring/trailingStopSupport.js';
import { loadOmegaTrailPeakGivebackPips } from './omegaRawPolicy/omegaRawTrailGiveback.js';
import { isAlphaOmegaEntryAdvisory } from './alphaOmega/alphaOmegaPureSizer.js';
import { sendTradeExecutedAlert } from '../services/telegram/alertTradeExecution.js';
import {
  alphaOmegaLaneLabelForBroker,
  formatAlphaOmegaFoundingHint,
} from '../services/telegram/alphaOmegaTelegramLabels.js';
import {
  applyOmegaFillUpdate,
  insertPendingOmegaRow,
  markOmegaRowCancelled,
} from './omegaTrailV1PendingRow.js';
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
  broker: BrokerClient;
  brokerId: string;
  /** Lane B shadow-tier advisory (nullable). */
  laneAdvisory?: string | null;
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
  const peakGivebackPips = await loadOmegaTrailPeakGivebackPips(supabase);
  // Lane B AO entries keep legacy 0.5R trail_distance (monitor skips Lane B exits anyway).
  const aoEntry = isAlphaOmegaEntryAdvisory(
    rowRecord.lane_advisory != null ? String(rowRecord.lane_advisory) : null,
  );
  const trailMetrics = computeTrailInsertFields(rowRecord, {
    omegaPeakGivebackPips: aoEntry ? null : peakGivebackPips,
  });
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
  logInfo('[Omega TrailV1] Trail state registered in-loop', {
    tradeId,
    signalId,
    trailDistance: trailMetrics.trailDistance,
    peakGivebackPips,
  });
}

async function bumpOmegaTradesToday(
  supabase: SupabaseClient,
  engineId: string,
  fallbackCount: number,
): Promise<void> {
  const { data: eng } = await supabase
    .from('bridge_engines')
    .select('trades_today')
    .eq('engine_id', engineId)
    .single();
  const newCount = ((eng as { trades_today?: number } | null)?.trades_today ?? fallbackCount) + 1;
  await supabase
    .from('bridge_engines')
    .update({ trades_today: newCount, updated_at: new Date().toISOString() })
    .eq('engine_id', engineId);
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
    broker,
    brokerId,
    laneAdvisory,
  } = deps;

  // Pre-insert BEFORE placing the order: if this fails, the order is never
  // placed, so no broker-side capital can ever be left untracked.
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
  rowRecord.broker_id = brokerId;
  rowRecord.units = finalUnits;
  if (laneAdvisory) {
    rowRecord.lane_advisory = laneAdvisory;
  }
  attachOmegaAuditFields(rowRecord, regimeState, regimeSizeMultiplier, amdState, directionMode);

  const pending = await insertPendingOmegaRow(supabase, rowRecord, { signalId, brokerId });
  if (!pending) return;

  let orderResult: Awaited<ReturnType<typeof placeMarketOrderViaBroker>>['orderResult'];
  try {
    ({ orderResult } = await placeMarketOrderViaBroker({
      broker,
      norm,
      finalUnits,
      useTrailStop: true,
      maxOrderTimeoutMs: config.maxOrderTimeoutMs,
      rebuildBoundsRetryEnabled: false,
    }));
  } catch (orderErr) {
    const orderError = orderErr instanceof Error ? orderErr.message : String(orderErr);
    logError('[Omega TrailV1] Broker order threw after pre-insert — row marked BLOCKED', {
      signalId,
      brokerId,
      error: orderError,
    });
    await markOmegaRowCancelled(
      supabase,
      pending.rowId,
      `${broker.brokerType === 'mt5' ? 'MT5' : 'BROKER'}_ORDER_ERROR: ${orderError}`,
    );
    return;
  }

  if (orderResult.orderCancelTransaction) {
    await markOmegaRowCancelled(
      supabase,
      pending.rowId,
      orderResult.orderCancelTransaction.reason ?? 'Order cancelled',
    );
    return;
  }

  const fillTx = orderResult.orderFillTransaction;
  const tradeId = fillTx?.tradeOpened?.tradeID ?? fillTx?.id;
  const filledUnits = fillTx?.units != null ? Number(fillTx.units) : finalUnits;
  const fillPrice = fillTx?.price != null ? Number(fillTx.price) : null;
  const mirroredStop =
    fillPrice != null
      ? mirrorStructureStop(fillPrice, norm.entryPrice, norm.stopLoss, norm.direction)
      : undefined;

  await applyOmegaFillUpdate(
    supabase,
    pending.rowId,
    {
      oanda_order_id: fillTx?.id,
      oanda_trade_id: tradeId,
      units: filledUnits,
      ...(fillPrice != null ? { fill_price: fillPrice, stop_loss: mirroredStop } : {}),
    },
    { signalId, brokerId },
  );

  rowRecord.oanda_order_id = fillTx?.id;
  rowRecord.oanda_trade_id = tradeId;
  rowRecord.units = filledUnits;
  if (fillPrice != null) {
    rowRecord.fill_price = fillPrice;
    rowRecord.stop_loss = mirroredStop;
  }

  if (tradeId && fillPrice != null) {
    rowRecord.engine_id = norm.engineId;
    rowRecord.pair = norm.oandaInstrument;
    rowRecord.direction = norm.direction;
    await registerTrailState(supabase, rowRecord, tradeId, fillPrice, signalId);
  }

  await bumpOmegaTradesToday(supabase, norm.engineId, engine.trades_today);

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
    laneLabel: alphaOmegaLaneLabelForBroker(brokerId),
    foundingHint: formatAlphaOmegaFoundingHint(laneAdvisory ?? null),
  }).catch(() => {});

  if (!tradeId || fillPrice == null) {
    logWarn('[Omega TrailV1] Executed without trade id or fill price', { signalId });
  }
}
