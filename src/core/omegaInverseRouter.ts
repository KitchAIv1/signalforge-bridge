import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalInsertPayload } from '../connectors/supabase.js';
import type { BridgeConfig, BridgeEngineRow } from '../types/config.js';
import type { AccountSummary } from '../connectors/oanda.js';
import type { DecisionType } from '../types/signals.js';
import { calculateUnits } from './positionSizer.js';
import { placeMarketOrderWithRebuildBoundsRetry } from './rebuildBoundsRetryOrder.js';
import { getConsecutiveLosses } from './circuitBreaker.js';
import { getCachedConversionRates } from '../monitoring/heartbeat.js';
import {
  evaluateInverseRiskGates,
  fetchOpenTradesFromLog,
  invertDirection,
  mirrorStopLossForShort,
  normalizeDirection,
  readPayloadScore,
  readPayloadSession,
  type DirectionSide,
} from './omegaInverseGates.js';
import type { MarketOrderNormSlice } from './rebuildBoundsRetryOrder.js';

export interface OmegaInverseRouterDeps {
  supabase: SupabaseClient;
  config: BridgeConfig;
  getCachedAccount: () => AccountSummary | null;
  engines: BridgeEngineRow[];
  decisionLatencyMs: number;
}

type NormalizedSignal = MarketOrderNormSlice & {
  pair: string;
  confluenceScore: number;
  slPipsFromSignal: number | null;
  takeProfit: number;
};

function buildInverseTradeLogRow(
  payload: SignalInsertPayload,
  engineId: string,
  decision: DecisionType,
  blockReason: string | null,
  decisionLatencyMs: number,
  equity: number | null,
  openCount: number,
  oandaPair: string,
  directionOverride: string,
): Record<string, unknown> {
  const entryPrice =
    payload.entry_zone_low != null && payload.entry_zone_high != null
      ? (Number(payload.entry_zone_low) + Number(payload.entry_zone_high)) / 2
      : null;
  return {
    signal_id: payload.id,
    engine_id: engineId,
    pair: oandaPair,
    direction: directionOverride.toLowerCase(),
    confluence_score: payload.confluence_score,
    regime: payload.regime ?? null,
    entry_zone_low: payload.entry_zone_low ?? null,
    entry_zone_high: payload.entry_zone_high ?? null,
    entry_price: entryPrice,
    stop_loss: payload.stop_loss,
    take_profit: payload.take_profit ?? payload.target_1 ?? null,
    signal_received_at: payload.created_at ?? new Date().toISOString(),
    decision,
    block_reason: blockReason,
    decision_latency_ms: decisionLatencyMs,
    broker_id: decision === 'EXECUTED' ? 'oanda_practice' : null,
    status: decision === 'EXECUTED' ? 'open' : 'pending',
    account_equity_at_signal: equity,
    open_positions_count: openCount,
  };
}

async function writeInverseBlockLog(
  deps: OmegaInverseRouterDeps,
  payload: SignalInsertPayload,
  oandaPair: string,
  blockReason: string,
  openCount: number,
): Promise<void> {
  const equity = deps.getCachedAccount()?.equity ?? null;
  await deps.supabase.from('bridge_trade_log').insert(
    buildInverseTradeLogRow(
      payload,
      'omega_inverse',
      'BLOCKED',
      blockReason,
      deps.decisionLatencyMs,
      equity,
      openCount,
      oandaPair,
      'SHORT',
    ),
  );
}

async function writeShadowOnlyLong(
  supabase: SupabaseClient,
  payload: SignalInsertPayload,
  norm: NormalizedSignal,
  invertedDirection: DirectionSide,
): Promise<void> {
  const rSize = Math.abs(norm.entryPrice - norm.stopLoss);
  const firedAt = payload.created_at != null
    ? String(payload.created_at)
    : new Date().toISOString();
  const pairLabel = (payload.pair ?? norm.pair).toString().replace('_', '');
  await supabase.from('omega_shadow_signals').insert({
    pattern_id: 'omega_inverse_shadow',
    fired_at: firedAt,
    pair: pairLabel,
    timeframe: 'M5',
    direction: invertedDirection,
    entry_price: norm.entryPrice,
    sl_price: norm.stopLoss,
    tp_1r_price: norm.entryPrice + rSize,
    tp_2r_price: norm.entryPrice + rSize * 2,
    tp_3r_price: norm.entryPrice + rSize * 3,
    r_size_raw: rSize,
    spread_pips: 0,
    spread_r: 0,
    session: readPayloadSession(payload),
    regime: payload.regime != null ? String(payload.regime) : 'unknown',
    atr14_raw: 0,
    centroid_distance: 0,
    confidence: readPayloadScore(payload),
  });
}

function getConversionRateForInstrument(instrument: string, rates: Record<string, number>): number {
  const quote = instrument.length >= 7 ? instrument.slice(4, 7) : 'USD';
  const rateKeys: Record<string, string> = {
    JPY: 'USD_JPY',
    CAD: 'USD_CAD',
    CHF: 'USD_CHF',
    GBP: 'GBP_USD',
    AUD: 'AUD_USD',
  };
  const rateKey = rateKeys[quote];
  return rateKey != null ? (rates[rateKey] ?? 0) : 0;
}

function buildInverseShortNorm(norm: NormalizedSignal): {
  inverseNorm: NormalizedSignal;
  shortStopLoss: number;
  shortTakeProfit: number;
} {
  const shortStopLoss = mirrorStopLossForShort(norm.entryPrice, norm.stopLoss);
  const slDistance = Math.abs(norm.entryPrice - norm.stopLoss);
  const shortTakeProfit = norm.entryPrice - slDistance;
  return {
    shortStopLoss,
    shortTakeProfit,
    inverseNorm: {
      ...norm,
      engineId: 'omega_inverse',
      direction: 'SHORT',
      stopLoss: shortStopLoss,
      takeProfit: shortTakeProfit,
    },
  };
}

function computeInverseShortUnits(
  deps: OmegaInverseRouterDeps,
  engine: BridgeEngineRow,
  norm: NormalizedSignal,
  shortStopLoss: number,
): number {
  const cachedAccount = deps.getCachedAccount();
  const conversionRate = getConversionRateForInstrument(
    norm.oandaInstrument,
    getCachedConversionRates(),
  );
  const unitCount = calculateUnits({
    equity: cachedAccount?.equity ?? 0,
    engineWeight: engine.weight,
    riskPct: deps.config.riskPerTradePct,
    entry: norm.entryPrice,
    stopLoss: shortStopLoss,
    instrument: norm.oandaInstrument,
    consecutiveLosses: getConsecutiveLosses(),
    graduatedThreshold: deps.config.graduatedResponseThreshold,
    confluenceScore: norm.confluenceScore,
    conversionRate,
    slPipsOverride: norm.slPipsFromSignal ?? undefined,
  });
  return -unitCount;
}

function buildExecutedInverseRow(
  deps: OmegaInverseRouterDeps,
  payload: SignalInsertPayload,
  norm: NormalizedSignal,
  openCount: number,
  shortStopLoss: number,
  shortTakeProfit: number,
  fillTx: {
    id?: string;
    tradeOpened?: { tradeID?: string };
    units?: string | number;
    price?: string | number;
  } | undefined,
  finalUnits: number,
): Record<string, unknown> {
  const cachedAccount = deps.getCachedAccount();
  const tradeId = fillTx?.tradeOpened?.tradeID ?? fillTx?.id;
  const filledUnits = fillTx?.units != null ? Number(fillTx.units) : finalUnits;
  const fillPrice = fillTx?.price != null ? Number(fillTx.price) : null;
  const row = buildInverseTradeLogRow(
    payload,
    'omega_inverse',
    'EXECUTED',
    null,
    deps.decisionLatencyMs,
    cachedAccount?.equity ?? null,
    openCount,
    norm.oandaInstrument,
    'SHORT',
  );
  row.oanda_order_id = fillTx?.id;
  row.oanda_trade_id = tradeId;
  row.units = filledUnits;
  if (fillPrice != null) {
    row.fill_price = fillPrice;
    row.stop_loss = mirrorStopLossForShort(fillPrice, norm.stopLoss);
  } else {
    row.stop_loss = shortStopLoss;
  }
  row.take_profit = shortTakeProfit;
  return row;
}

async function bumpInverseEngineTradesToday(
  supabase: SupabaseClient,
  engine: BridgeEngineRow,
): Promise<void> {
  const { data: engineRow } = await supabase
    .from('bridge_engines')
    .select('trades_today')
    .eq('engine_id', 'omega_inverse')
    .single();
  const newCount =
    ((engineRow as { trades_today?: number } | null)?.trades_today ?? engine.trades_today) + 1;
  await supabase
    .from('bridge_engines')
    .update({ trades_today: newCount, updated_at: new Date().toISOString() })
    .eq('engine_id', 'omega_inverse');
}

async function persistInverseExecution(
  deps: OmegaInverseRouterDeps,
  payload: SignalInsertPayload,
  norm: NormalizedSignal,
  engine: BridgeEngineRow,
  openCount: number,
  shortStopLoss: number,
  shortTakeProfit: number,
  fillTx: {
    id?: string;
    tradeOpened?: { tradeID?: string };
    units?: string | number;
    price?: string | number;
  } | undefined,
  finalUnits: number,
): Promise<void> {
  const row = buildExecutedInverseRow(
    deps,
    payload,
    norm,
    openCount,
    shortStopLoss,
    shortTakeProfit,
    fillTx,
    finalUnits,
  );
  await deps.supabase.from('bridge_trade_log').insert(row);
  await bumpInverseEngineTradesToday(deps.supabase, engine);
}

async function executeInverseShort(
  deps: OmegaInverseRouterDeps,
  payload: SignalInsertPayload,
  norm: NormalizedSignal,
  openCount: number,
): Promise<void> {
  const engine = deps.engines.find((row) => row.engine_id === 'omega_inverse');
  if (!engine?.is_active) {
    console.log('[OmegaInverse] BLOCKED — omega_inverse engine inactive or missing');
    return;
  }
  const { inverseNorm, shortStopLoss, shortTakeProfit } = buildInverseShortNorm(norm);
  const finalUnits = computeInverseShortUnits(deps, engine, norm, shortStopLoss);
  const { orderResult } = await placeMarketOrderWithRebuildBoundsRetry({
    norm: inverseNorm,
    finalUnits,
    useTrailStop: true,
    maxOrderTimeoutMs: deps.config.maxOrderTimeoutMs,
    rebuildBoundsRetryEnabled: false,
  });
  if (orderResult.orderCancelTransaction) {
    const cancelReason = orderResult.orderCancelTransaction.reason ?? 'Order cancelled';
    await writeInverseBlockLog(deps, payload, norm.oandaInstrument, cancelReason, openCount);
    return;
  }
  await persistInverseExecution(
    deps,
    payload,
    norm,
    engine,
    openCount,
    shortStopLoss,
    shortTakeProfit,
    orderResult.orderFillTransaction,
    finalUnits,
  );
}

async function runInverseRiskGateChain(
  deps: OmegaInverseRouterDeps,
  payload: SignalInsertPayload,
  norm: NormalizedSignal,
  omegaDirection: string,
  invertedDirection: DirectionSide,
  openTrades: Array<{ pair: string; units: number }>,
): Promise<boolean> {
  const gateResult = await evaluateInverseRiskGates(
    deps.supabase,
    openTrades,
    norm.oandaInstrument,
    omegaDirection,
    invertedDirection,
    deps.config.newsBlackoutEnabled,
    deps.config.maxPerPairPositions,
    deps.config.maxCorrelatedExposure,
  );
  if (!gateResult.blocked) return true;
  if (gateResult.reason === 'DEDUP') {
    console.log('[OmegaInverse] Dedup: skipping');
    return false;
  }
  if (gateResult.reason === 'OMEGA_WINDOW_EXPIRED') {
    console.log('[OmegaInverse] OMEGA_WINDOW_EXPIRED — signal blocked');
  } else if (String(gateResult.reason).startsWith('NEWS_PRE_BLOCK')) {
    console.log(`[OmegaInverse] ${gateResult.reason}`);
  } else if (gateResult.reason === 'Open opposite position') {
    console.log('[OmegaInverse] BLOCKED — open opposite position');
  } else if (gateResult.reason === 'Max per-pair positions reached') {
    console.log('[OmegaInverse] BLOCKED — per-pair cap reached');
  } else {
    console.log('[OmegaInverse] BLOCKED — correlation cap exceeded');
  }
  await writeInverseBlockLog(
    deps,
    payload,
    norm.oandaInstrument,
    gateResult.reason,
    openTrades.length,
  );
  return false;
}

export async function processOmegaInverse(
  payload: SignalInsertPayload,
  norm: NormalizedSignal,
  omegaDirection: string,
  deps: OmegaInverseRouterDeps,
): Promise<void> {
  try {
    const openTrades = await fetchOpenTradesFromLog(deps.supabase);
    const dtwDirection = normalizeDirection(String(payload.direction ?? norm.direction));
    const omegaDir = normalizeDirection(omegaDirection);
    if (dtwDirection == null || omegaDir == null) return;
    if (dtwDirection === omegaDir) {
      console.log('[OmegaInverse] Suppressed — DTW agrees with direction, Prime handles');
      return;
    }
    const invertedDirection = invertDirection(dtwDirection);
    if (invertedDirection === 'long') {
      await writeShadowOnlyLong(deps.supabase, payload, norm, invertedDirection);
      console.log('[OmegaInverse] SHORT→LONG shadow only — not executed live');
      return;
    }
    const passedGates = await runInverseRiskGateChain(
      deps,
      payload,
      norm,
      omegaDirection,
      invertedDirection,
      openTrades,
    );
    if (!passedGates) return;
    await executeInverseShort(deps, payload, norm, openTrades.length);
  } catch (inverseErr: unknown) {
    console.error('[OmegaInverse] processOmegaInverse failed:', String(inverseErr));
  }
}
