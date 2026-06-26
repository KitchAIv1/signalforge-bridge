/** Load omega primary legs pending shadow trail resolution. */

import type { SupabaseClient } from '@supabase/supabase-js';
import { PIP_SIZE, type PendingOmegaSignal } from './types.js';

const PRIMARY_SELECT =
  'id, signal_id, created_at, direction, entry_price, stop_loss, pnl_pips, result, leg_type';

function readNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeDir(raw: unknown): 'long' | 'short' | null {
  const value = String(raw ?? '').toLowerCase();
  if (value === 'long' || value === 'short') return value;
  return null;
}

function isPrimaryOmegaLeg(legType: unknown): boolean {
  if (legType == null) return true;
  const label = String(legType).toLowerCase();
  return label === 'tp1' || label === 'primary' || label === 'trail';
}

export async function loadPendingOmegaSignals(
  supabase: SupabaseClient,
  limit: number = 50,
): Promise<PendingOmegaSignal[]> {
  const { data: tradeRows, error } = await supabase
    .from('bridge_trade_log')
    .select(PRIMARY_SELECT)
    .eq('engine_id', 'omega')
    .in('status', ['open', 'closed'])
    .order('created_at', { ascending: false })
    .limit(limit * 5);
  if (error) throw new Error(`[ShadowTrail] primary fetch: ${error.message}`);

  const { data: resolvedRows } = await supabase
    .from('omega_shadow_trail_exit')
    .select('signal_id, filter_reason')
    .limit(5000);
  const resolved = new Set(
    (resolvedRows ?? [])
      .filter(row => row.filter_reason !== 'insufficient_m5_bars')
      .map(row => String(row.signal_id)),
  );

  const pending: PendingOmegaSignal[] = [];
  for (const row of tradeRows ?? []) {
    if (!isPrimaryOmegaLeg(row.leg_type)) continue;
    const signalId = String(row.signal_id ?? '');
    if (!signalId || resolved.has(signalId)) continue;
    const direction = normalizeDir(row.direction);
    const entryPrice = readNum(row.entry_price);
    const stopLoss = readNum(row.stop_loss);
    if (!direction || entryPrice == null || stopLoss == null) continue;
    const rSizeRaw = Math.abs(entryPrice - stopLoss);
    if (rSizeRaw <= 0) continue;
    pending.push({
      signalId,
      tradeLogId: String(row.id),
      firedAt: String(row.created_at),
      direction,
      entryPrice,
      stopLoss,
      rSizeRaw,
      rPips: rSizeRaw / PIP_SIZE,
      livePnlPips: readNum(row.pnl_pips),
      liveResult: row.result != null ? String(row.result) : null,
    });
    if (pending.length >= limit) break;
  }
  return pending;
}

export async function loadLiveLegPnl(
  supabase: SupabaseClient,
  signalId: string,
): Promise<{ pnlPips: number | null; result: string | null }> {
  const { data } = await supabase
    .from('bridge_trade_log')
    .select('pnl_pips, result')
    .eq('signal_id', signalId)
    .eq('engine_id', 'omega');
  if (!data?.length) return { pnlPips: null, result: null };
  let sum = 0;
  let hasPnl = false;
  for (const row of data) {
    const pips = readNum(row.pnl_pips);
    if (pips != null) {
      sum += pips;
      hasPnl = true;
    }
  }
  const closed = data.find(row => row.result != null);
  return {
    pnlPips: hasPnl ? sum : null,
    result: closed?.result != null ? String(closed.result) : null,
  };
}
