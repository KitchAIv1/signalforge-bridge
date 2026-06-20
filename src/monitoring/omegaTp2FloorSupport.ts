/**
 * Helpers for Omega tp2 first-peak floor ratchet (4p floor after peak > 4p, 6p broker TP).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { OMEGA_T1_PIPS } from '../core/omegaRatchetConstants.js';

export function getOmegaTp2FloorEnabled(): boolean {
  return process.env.OMEGA_TP2_FLOOR_ENABLED !== 'false';
}

export interface Tp2FloorState {
  oanda_trade_id: string;
  engine_id: string;
  pair: string;
  direction: string;
  fill_price: number;
  floor_pips: number;
  tp_target_pips: number;
  peak_favorable_pips: number;
}

export function toTp2FloorState(raw: Record<string, unknown>): Tp2FloorState | null {
  const tradeId = raw.oanda_trade_id;
  if (tradeId == null || typeof tradeId !== 'string') return null;
  return {
    oanda_trade_id: tradeId,
    engine_id: String(raw.engine_id ?? 'omega'),
    pair: String(raw.pair ?? ''),
    direction: String(raw.direction ?? ''),
    fill_price: Number(raw.fill_price),
    floor_pips: Number(raw.floor_pips ?? OMEGA_T1_PIPS),
    tp_target_pips: Number(raw.tp_target_pips ?? 6),
    peak_favorable_pips: Number(raw.peak_favorable_pips ?? 0),
  };
}

export function pipSizeForInstrument(instrument: string): number {
  return instrument.includes('JPY') ? 0.01 : 0.0001;
}

export function favorablePipsFromPrice(
  direction: string,
  fillPrice: number,
  marketPrice: number,
  pipSize: number,
): number {
  const isLong = direction.toLowerCase() === 'long' || direction.toLowerCase() === 'buy';
  const rawPips = isLong
    ? (marketPrice - fillPrice) / pipSize
    : (fillPrice - marketPrice) / pipSize;
  return parseFloat(rawPips.toFixed(2));
}

export function candleFavorablePips(
  direction: string,
  fillPrice: number,
  candle: { high: number; low: number },
  pipSize: number,
): number {
  const isLong = direction.toLowerCase() === 'long' || direction.toLowerCase() === 'buy';
  const extreme = isLong ? candle.high : candle.low;
  return favorablePipsFromPrice(direction, fillPrice, extreme, pipSize);
}

export function shouldCloseTp2AtFloor(
  peakFavorablePips: number,
  liveFavorablePips: number,
  floorPips: number,
): boolean {
  return peakFavorablePips > floorPips && liveFavorablePips <= floorPips;
}

export async function tp2FloorRowExists(
  supabase: SupabaseClient,
  tradeId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('omega_tp2_floor_state')
    .select('oanda_trade_id')
    .eq('oanda_trade_id', tradeId)
    .maybeSingle();
  if (error) {
    console.warn('[Tp2Floor] tp2FloorRowExists select failed', error.message);
    return true;
  }
  return Boolean(data);
}

export async function deleteTp2FloorState(
  supabase: SupabaseClient,
  tradeId: string,
): Promise<void> {
  await supabase.from('omega_tp2_floor_state').delete().eq('oanda_trade_id', tradeId);
}

export function inferOmegaTp2CloseReason(
  exitPrice: number,
  fillPrice: number,
  direction: string,
  pair: string,
  storedTakeProfit: number | null,
): string {
  const tolerance = 0.00005;
  if (storedTakeProfit != null && Math.abs(exitPrice - storedTakeProfit) <= tolerance) {
    return 'tp_hit';
  }
  const pipSize = pipSizeForInstrument(pair);
  const isLong = direction.toLowerCase() === 'long' || direction.toLowerCase() === 'buy';
  const floorPrice = isLong
    ? fillPrice + OMEGA_T1_PIPS * pipSize
    : fillPrice - OMEGA_T1_PIPS * pipSize;
  if (Math.abs(exitPrice - floorPrice) <= tolerance) {
    return 'ratchet_floor';
  }
  return 'external_close';
}
