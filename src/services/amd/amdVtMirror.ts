/**
 * AMD -> VT Markets mirror leg (same MetaApi account as AO, magic 88005).
 * Kill-switched via bridge_config amd_vt_mirror_enabled (default OFF) and the
 * engine_amd -> vtmarkets_ao_live bridge_link (ships inactive). Sizing is
 * independent of AO and of AMD-on-OANDA: shared AMD risk formula against VT
 * equity, then amd_vt_size_multiplier (default 0.05 for the 0.01-lot
 * validation phase). Runs only after a confirmed OANDA fill; failures are
 * logged and never affect the OANDA book.
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

export interface AmdVtMirrorParams {
  supabase: SupabaseClient;
  tag: string;
  direction: AmdTradeDirection;
  /** amd_state audit fields copied onto the VT log row. */
  amdRow: Record<string, unknown>;
  /** OANDA plan — entry/SL prices and risk inputs reused for the VT leg. */
  plan: AmdDistributionOrderPlan;
  exitStrategy: string;
  todayStr: string;
}

async function findVtRoute(supabase: SupabaseClient): Promise<EngineBrokerRoute | null> {
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

async function persistVtOpenTrade(
  params: AmdVtMirrorParams,
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
  await supabase.from('bridge_trade_log').insert({
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
}

async function persistVtTrailState(
  params: AmdVtMirrorParams,
  fillPrice: number,
  positionId: string,
  timeGateUtcHour: number | null,
): Promise<void> {
  const { supabase, tag, direction, plan, exitStrategy, todayStr } = params;
  await supabase.from('amd_trail_stop_state').insert({
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
}

/**
 * Mirror an already-filled OANDA AMD entry onto VT. Non-fatal by design:
 * every failure path logs and returns without touching the OANDA book.
 */
export async function mirrorAmdOrderToVt(
  params: AmdVtMirrorParams,
  timeGateUtcHour: number | null,
): Promise<void> {
  const { supabase, tag, direction, plan } = params;
  if (!(await isAmdVtMirrorEnabled(supabase))) return;
  const route = await findVtRoute(supabase);
  if (!route) {
    logWarn('[AmdVtMirror] enabled but no active engine_amd->VT route — skipping');
    return;
  }
  const vtSizeMultiplier = await loadAmdVtSizeMultiplier(supabase);
  const vtEquity = (await route.broker.getAccountSummary()).equity;
  const vtSignedUnits = sizeVtUnits(vtEquity, vtSizeMultiplier, plan, direction);
  logInfo('[AmdVtMirror] Placing VT mirror order', {
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
    logError('[AmdVtMirror] VT order failed — no position id', { orderResult });
    return;
  }
  const fillPrice = fillTx?.price != null ? Number(fillTx.price) : plan.entryPrice;
  logInfo('[AmdVtMirror] VT mirror filled', { positionId, fillPrice, tag, direction });
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
