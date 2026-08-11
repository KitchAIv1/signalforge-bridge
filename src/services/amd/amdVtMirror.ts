/**
 * AMD VT peer leg (same MetaApi account as AO, magic 88005).
 * Kill-switched via amd_vt_mirror_enabled; requires active engine_amd→VT link
 * and healthy AO VT route. Sized independently via amd_vt_size_multiplier.
 * Peer of the OANDA leg (Promise.allSettled fan-out) — not a post-fill mirror.
 */

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateUnits } from '../../core/positionSizer.js';
import { logError, logInfo, logWarn } from '../../utils/logger.js';
import { OMEGA_AO_VT_BROKER_ID } from '../../core/alphaOmega/alphaOmegaConstants.js';
import { loadExecutionRoutes } from '../broker/brokerLinkService.js';
import type { EngineBrokerRoute } from '../broker/brokerLinkService.js';
import type { AmdDistributionOrderPlan, AmdTradeDirection } from './buildAmdDistributionOrderPlan.js';
import { AMD_PIP_TRAIL_PIPS } from './amdTrailConstants.js';
import { hasAmdVenueExecutedToday } from './amdVenueExecutedToday.js';
import { isAoVtRouteHealthy } from './isAoVtRouteHealthy.js';
import {
  amdEffectiveEngineWeight,
  computeAmdRiskAmount,
} from './resolveAmdSizeMultiplier.js';

export const AMD_VT_MIRROR_ENABLED_CONFIG_KEY = 'amd_vt_mirror_enabled';
export const AMD_VT_SIZE_MULTIPLIER_CONFIG_KEY = 'amd_vt_size_multiplier';
export const AMD_VT_BROKER_ID = OMEGA_AO_VT_BROKER_ID;

const INSTRUMENT = 'AUD_USD';
const ENGINE_ID = 'engine_amd';
const BASELINE_RISK_PCT = 0.02;
const DEFAULT_VT_SIZE_MULTIPLIER = 0.05;
const MIN_VT_SIZE_MULTIPLIER = 0.01;
const MAX_VT_SIZE_MULTIPLIER = 2;

/** Defaults to false on missing row/error — safe by construction. */
export async function isAmdVtMirrorEnabled(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', AMD_VT_MIRROR_ENABLED_CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return false;
  return data.config_value === true || data.config_value === 'true';
}

/** VT-leg-only multiplier; invalid/missing falls back to the safe default. */
export async function loadAmdVtSizeMultiplier(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', AMD_VT_SIZE_MULTIPLIER_CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return DEFAULT_VT_SIZE_MULTIPLIER;
  const parsed = Number(data.config_value);
  if (!Number.isFinite(parsed)) return DEFAULT_VT_SIZE_MULTIPLIER;
  if (parsed < MIN_VT_SIZE_MULTIPLIER || parsed > MAX_VT_SIZE_MULTIPLIER) {
    return DEFAULT_VT_SIZE_MULTIPLIER;
  }
  return parsed;
}

export interface AmdVtLegParams {
  supabase: SupabaseClient;
  tag: string;
  direction: AmdTradeDirection;
  amdRow: Record<string, unknown>;
  plan: AmdDistributionOrderPlan;
  exitStrategy: string;
  todayStr: string;
}

/** @deprecated Use AmdVtLegParams — kept for call-site clarity during rename. */
export type AmdVtMirrorParams = AmdVtLegParams;

async function findAmdVtRoute(supabase: SupabaseClient): Promise<EngineBrokerRoute | null> {
  const routes = await loadExecutionRoutes(supabase, ENGINE_ID);
  return routes.find((route) => route.brokerId === AMD_VT_BROKER_ID) ?? null;
}

function sizeVtUnits(
  vtEquity: number,
  vtSizeMultiplier: number,
  plan: AmdDistributionOrderPlan,
  direction: AmdTradeDirection,
): number {
  const effectiveWeight =
    amdEffectiveEngineWeight(plan.weight, plan.sizeMultiplier) * vtSizeMultiplier;
  const units = calculateUnits({
    equity: vtEquity,
    engineWeight: effectiveWeight,
    riskPct: BASELINE_RISK_PCT,
    entry: plan.entryPrice,
    stopLoss: plan.hardSlPrice,
    instrument: INSTRUMENT,
    consecutiveLosses: 0,
    graduatedThreshold: 999,
    confluenceScore: 75,
    slPipsOverride: plan.hardSlPips,
  });
  return direction === 'long' ? units : -units;
}

export async function writeAmdVtBlockedLog(
  params: Pick<AmdVtLegParams, 'supabase' | 'tag' | 'direction' | 'amdRow' | 'plan'>,
  reason: string,
): Promise<void> {
  const { supabase, tag, direction, amdRow, plan } = params;
  const { error } = await supabase.from('bridge_trade_log').insert({
    signal_id: randomUUID(),
    engine_id: ENGINE_ID,
    broker_id: AMD_VT_BROKER_ID,
    pair: INSTRUMENT,
    direction: direction.toUpperCase(),
    stop_loss: plan.hardSlPrice,
    signal_received_at: new Date().toISOString(),
    decision: 'BLOCKED',
    block_reason: reason,
    status: 'pending',
    amd_tag: tag,
    amd_evaluated_at: amdRow.evaluated_at,
    layer4_d1_bias: amdRow.layer4_d1_bias,
    daily_bias_alignment: amdRow.daily_bias_alignment,
  });
  if (error) {
    logError('[AmdVtLeg] BLOCKED log insert failed', { reason, error: error.message });
  }
}

async function persistVtOpenTrade(
  params: AmdVtLegParams,
  vtEquity: number,
  vtSignedUnits: number,
  vtSizeMultiplier: number,
  fillPrice: number,
  positionId: string,
): Promise<void> {
  const { supabase, tag, direction, amdRow, plan, exitStrategy } = params;
  const riskAmount =
    computeAmdRiskAmount(vtEquity, plan.weight, plan.sizeMultiplier, BASELINE_RISK_PCT) *
    vtSizeMultiplier;
  const { error } = await supabase.from('bridge_trade_log').insert({
    signal_id: randomUUID(),
    engine_id: ENGINE_ID,
    broker_id: AMD_VT_BROKER_ID,
    pair: INSTRUMENT,
    direction: direction.toUpperCase(),
    stop_loss: plan.hardSlPrice,
    entry_price: fillPrice,
    fill_price: fillPrice,
    units: vtSignedUnits,
    oanda_trade_id: positionId,
    signal_received_at: new Date().toISOString(),
    decision: 'EXECUTED',
    status: 'open',
    account_equity_at_signal: vtEquity,
    risk_amount: riskAmount,
    amd_tag: tag,
    amd_evaluated_at: amdRow.evaluated_at,
    layer4_d1_bias: amdRow.layer4_d1_bias,
    daily_bias_alignment: amdRow.daily_bias_alignment,
    direction_source: 'amd_auto_direction',
    reversal_confirmed: amdRow.reversal_confirmed,
    auto_direction_reason: amdRow.auto_direction_reason,
    amd_size_multiplier: plan.sizeMultiplier,
    amd_entry_hour: new Date().getUTCHours(),
    amd_exit_strategy: exitStrategy,
    amd_pip_trail: AMD_PIP_TRAIL_PIPS,
    amd_hard_sl_pips: plan.hardSlPips,
  });
  if (error) {
    logError('[AmdVtLeg] EXECUTED log insert failed after fill', {
      positionId,
      error: error.message,
    });
  }
}

async function persistVtTrailState(
  params: AmdVtLegParams,
  fillPrice: number,
  positionId: string,
  timeGateUtcHour: number | null,
): Promise<void> {
  const { supabase, tag, direction, plan, exitStrategy, todayStr } = params;
  const { error } = await supabase.from('amd_trail_stop_state').insert({
    oanda_trade_id: positionId,
    broker_id: AMD_VT_BROKER_ID,
    engine_id: ENGINE_ID,
    direction,
    fill_price: fillPrice,
    hard_sl_price: plan.hardSlPrice,
    trail_pip_distance: AMD_PIP_TRAIL_PIPS,
    peak_favorable_price: fillPrice,
    time_gate_utc_hour: timeGateUtcHour,
    trade_date: todayStr,
    amd_tag: tag,
    exit_strategy: exitStrategy,
    status: 'open',
  });
  if (error) {
    logError('[AmdVtLeg] trail state insert failed after fill', {
      positionId,
      error: error.message,
    });
  }
}

async function armAmdVtLeg(
  params: AmdVtLegParams,
): Promise<EngineBrokerRoute | null> {
  const { supabase } = params;
  if (!(await isAmdVtMirrorEnabled(supabase))) {
    logInfo('[AmdVtLeg] amd_vt_mirror_enabled OFF — skipping VT leg');
    return null;
  }
  if (await hasAmdVenueExecutedToday(supabase, AMD_VT_BROKER_ID, params.todayStr)) {
    logInfo('[AmdVtLeg] Already EXECUTED today — skipping VT leg');
    return null;
  }
  if (!(await isAoVtRouteHealthy(supabase))) {
    logWarn('[AmdVtLeg] AO VT route unhealthy — BLOCKED');
    await writeAmdVtBlockedLog(params, 'AO_VT_UNHEALTHY');
    return null;
  }
  const route = await findAmdVtRoute(supabase);
  if (!route) {
    logWarn('[AmdVtLeg] no active engine_amd->VT route — BLOCKED');
    await writeAmdVtBlockedLog(params, 'AMD_VT_ROUTE_INACTIVE');
    return null;
  }
  return route;
}

async function finalizeAmdVtFill(
  params: AmdVtLegParams,
  vtEquity: number,
  vtSignedUnits: number,
  vtSizeMultiplier: number,
  positionId: string,
  fillPrice: number,
  timeGateUtcHour: number | null,
): Promise<void> {
  const { tag, direction } = params;
  logInfo('[AmdVtLeg] VT peer filled', { positionId, fillPrice, tag, direction });
  await persistVtOpenTrade(
    params,
    vtEquity,
    vtSignedUnits,
    vtSizeMultiplier,
    fillPrice,
    positionId,
  );
  await persistVtTrailState(params, fillPrice, positionId, timeGateUtcHour);
}

async function submitAmdVtOrder(
  params: AmdVtLegParams,
  route: EngineBrokerRoute,
  timeGateUtcHour: number | null,
): Promise<void> {
  const { tag, direction, plan } = params;
  const vtSizeMultiplier = await loadAmdVtSizeMultiplier(params.supabase);
  const vtEquity = (await route.broker.getAccountSummary()).equity;
  const vtSignedUnits = sizeVtUnits(vtEquity, vtSizeMultiplier, plan, direction);
  logInfo('[AmdVtLeg] Placing VT peer order', {
    tag,
    direction,
    vtEquity,
    vtSizeMultiplier,
    vtSignedUnits,
    hardSlPrice: plan.hardSlPrice,
  });
  const orderResult = await route.broker.placeMarketOrder(
    {
      instrument: INSTRUMENT,
      units: vtSignedUnits,
      stopLossPrice: plan.hardSlPrice.toFixed(5),
    },
    10_000,
  );
  const fillTx = orderResult.orderFillTransaction;
  const positionId = fillTx?.tradeOpened?.tradeID ?? fillTx?.id ?? null;
  if (!positionId) {
    logError('[AmdVtLeg] VT order failed — no position id', { orderResult });
    await writeAmdVtBlockedLog(params, 'MT5_ORDER_ERROR: no position id');
    return;
  }
  const fillPrice = fillTx?.price != null ? Number(fillTx.price) : plan.entryPrice;
  await finalizeAmdVtFill(
    params,
    vtEquity,
    vtSignedUnits,
    vtSizeMultiplier,
    positionId,
    fillPrice,
    timeGateUtcHour,
  );
}

/**
 * Place AMD on VT as an independent peer leg. Failures never touch OANDA.
 * Every arming/order miss (except kill-switch OFF / already EXECUTED) writes BLOCKED.
 */
export async function placeAmdVtLeg(
  params: AmdVtLegParams,
  timeGateUtcHour: number | null,
): Promise<void> {
  const route = await armAmdVtLeg(params);
  if (!route) return;
  await submitAmdVtOrder(params, route, timeGateUtcHour);
}

/**
 * @deprecated Use placeAmdVtLeg — sequential mirror name retained for grep safety.
 */
export async function mirrorAmdOrderToVt(
  params: AmdVtLegParams,
  timeGateUtcHour: number | null,
): Promise<void> {
  await placeAmdVtLeg(params, timeGateUtcHour);
}
