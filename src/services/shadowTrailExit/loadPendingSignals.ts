/** Load omega tp1 legs pending shadow trail resolution. */

import type { SupabaseClient } from '@supabase/supabase-js';
import { PIP_SIZE, type PendingOmegaSignal } from './types.js';

const TP1_SELECT =
  'id, signal_id, created_at, direction, entry_price, stop_loss, pnl_pips, result';

function readNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeDir(raw: unknown): 'long' | 'short' | null {
  const v = String(raw ?? '').toLowerCase();
  if (v === 'long' || v === 'short') return v;
  return null;
}

export async function loadPendingOmegaSignals(
  supabase: SupabaseClient,
  limit: number = 50,
): Promise<PendingOmegaSignal[]> {
  const { data: tp1Rows, error } = await supabase
    .from('bridge_trade_log')
    .select(TP1_SELECT)
    .eq('engine_id', 'omega')
    .eq('leg_type', 'tp1')
    .in('status', ['open', 'closed'])
    .order('created_at', { ascending: false })
    .limit(limit * 3);
  if (error) throw new Error(`[ShadowTrail] tp1 fetch: ${error.message}`);

  const { data: resolvedRows } = await supabase
    .from('omega_shadow_trail_exit')
    .select('signal_id')
    .limit(5000);
  const resolved = new Set((resolvedRows ?? []).map(r => String(r.signal_id)));

  const pending: PendingOmegaSignal[] = [];
  for (const row of tp1Rows ?? []) {
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
    const p = readNum(row.pnl_pips);
    if (p != null) {
      sum += p;
      hasPnl = true;
    }
  }
  const closed = data.find(r => r.result != null);
  return { pnlPips: hasPnl ? sum : null, result: closed?.result != null ? String(closed.result) : null };
}
