/**
 * Internal helpers for trailing stop monitor (env, pair parsing, state math, peak updates).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export function getTrailEnabled(): boolean {
  return process.env.TRAIL_STOP_ENABLED === 'true';
}

export function getTrailEngineIds(): string[] {
  const raw = process.env.TRAIL_STOP_ENGINE_IDS ?? '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function getSlMultiplier(): number {
  return parseFloat(process.env.TRAIL_STOP_SL_MULTIPLIER ?? '1.5');
}

export function getTrailDistanceMultiplier(): number {
  return parseFloat(process.env.TRAIL_STOP_TRAIL_DISTANCE ?? '1.5');
}

export function getActivationR(): number {
  return parseFloat(process.env.TRAIL_STOP_ACTIVATION_R ?? '0.0');
}

export interface TrailState {
  oanda_trade_id: string;
  pair: string;
  direction: string;
  peak_favorable: number;
  trail_activated: boolean;
  sl_distance: number;
  trail_distance: number;
  r_size_raw: number;
  activation_threshold: number;
}

export function pairToInstrument(pair: string): string {
  const lettersOnly = pair.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (lettersOnly.length < 6) {
    return pair;
  }
  return `${lettersOnly.slice(0, 3)}_${lettersOnly.slice(3, 6)}`;
}

export function toTrailState(raw: Record<string, unknown>): TrailState | null {
  const oid = raw.oanda_trade_id;
  if (oid == null || typeof oid !== 'string') return null;
  return {
    oanda_trade_id: oid,
    pair: String(raw.pair ?? ''),
    direction: String(raw.direction ?? ''),
    peak_favorable: Number(raw.peak_favorable ?? 0),
    trail_activated: Boolean(raw.trail_activated),
    sl_distance: Number(raw.sl_distance),
    trail_distance: Number(raw.trail_distance),
    r_size_raw: Number(raw.r_size_raw),
    activation_threshold: Number(raw.activation_threshold),
  };
}

export function favorableAndAdverse(
  direction: string,
  fillPrice: number,
  candle: { high: number; low: number }
): { favorable: number; adverse: number } {
  if (direction === 'long') {
    return {
      favorable: candle.high - fillPrice,
      adverse: fillPrice - candle.low,
    };
  }
  return {
    favorable: fillPrice - candle.low,
    adverse: candle.high - fillPrice,
  };
}

export const NO_TRAIL_CLOSE = { shouldClose: false, reason: '', pnlR: null as number | null };

export function computeTrailInsertFields(row: Record<string, unknown>): {
  rSizeRaw: number;
  slDistance: number;
  trailDistance: number;
  activationThreshold: number;
} | null {
  const fillPrice = Number(row.fill_price);
  const stopLoss = Number(row.stop_loss);
  const rSizeRaw = Math.abs(fillPrice - stopLoss);
  if (!Number.isFinite(rSizeRaw) || rSizeRaw <= 0) return null;
  const slMultiplier = getSlMultiplier();
  const trailDistanceR = getTrailDistanceMultiplier();
  const activationR = getActivationR();
  return {
    rSizeRaw,
    slDistance: rSizeRaw * slMultiplier,
    trailDistance: rSizeRaw * trailDistanceR,
    activationThreshold: rSizeRaw * activationR,
  };
}

export async function applyTrailPeakUpdates(
  supabase: SupabaseClient,
  oandaTradeId: string,
  state: TrailState,
  nowActivated: boolean,
  favorable: number
): Promise<number> {
  let peakFavorable = state.peak_favorable;
  if (nowActivated && favorable > peakFavorable) {
    peakFavorable = favorable;
    await supabase
      .from('trail_stop_state')
      .update({
        peak_favorable: peakFavorable,
        trail_activated: true,
        updated_at: new Date().toISOString(),
      })
      .eq('oanda_trade_id', oandaTradeId);
    return peakFavorable;
  }
  if (nowActivated && !state.trail_activated) {
    await supabase
      .from('trail_stop_state')
      .update({ trail_activated: true, updated_at: new Date().toISOString() })
      .eq('oanda_trade_id', oandaTradeId);
  }
  return peakFavorable;
}

export async function loadTrailStateForCheck(
  supabase: SupabaseClient,
  oandaTradeId: string
): Promise<TrailState | null> {
  const { data: rawState } = await supabase
    .from('trail_stop_state')
    .select('*')
    .eq('oanda_trade_id', oandaTradeId)
    .maybeSingle();
  const state = rawState ? toTrailState(rawState as Record<string, unknown>) : null;
  if (!state || !Number.isFinite(state.r_size_raw) || state.r_size_raw <= 0) {
    return null;
  }
  return state;
}

export function evaluateTrailExitDecision(
  state: TrailState,
  nowActivated: boolean,
  peakFavorable: number,
  favorable: number,
  adverse: number
): { shouldClose: boolean; reason: string; pnlR: number | null } | null {
  if (nowActivated && peakFavorable > 0) {
    const trailExitLevel = peakFavorable - state.trail_distance;
    if (favorable <= trailExitLevel) {
      const lockedPnlR = trailExitLevel / state.r_size_raw;
      return { shouldClose: true, reason: 'trail_stop', pnlR: lockedPnlR };
    }
  }
  if (nowActivated && adverse >= state.sl_distance) {
    return { shouldClose: true, reason: 'trail_sl_hit', pnlR: -getSlMultiplier() };
  }
  return null;
}

export async function trailStopRowExists(
  supabase: SupabaseClient,
  tradeId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('trail_stop_state')
    .select('oanda_trade_id')
    .eq('oanda_trade_id', tradeId)
    .maybeSingle();
  if (error) {
    console.warn('[TrailStop] ensureTrailStopState select failed', error.message);
    return true;
  }
  return Boolean(data);
}
