/**
 * Omega SL pause gate — consecutive loss protection.
 *
 * After 3 consecutive SL hits on the tp1 leg (proxy for "this trade was a loss"),
 * omega is paused for the rest of the current session. Resumes automatically
 * when a new session begins — no state table required.
 *
 * Uses bridge_trade_log WHERE leg_type='tp1' AND result IS NOT NULL.
 * Only closed tp1 legs with a definitive result count.
 * signal_session is null on trade rows so session is derived from created_at.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

type SessionLabel = 'Asian' | 'London' | 'overlap' | 'NY';

const CONSECUTIVE_SL_LIMIT = 3;

export function getSessionLabel(date: Date): SessionLabel {
  const hour = date.getUTCHours();
  if (hour >= 21 || hour < 8) return 'Asian';
  if (hour < 12) return 'London';
  if (hour < 17) return 'overlap';
  return 'NY';
}

interface TradeResultRow {
  result: string | null;
  created_at: string;
}

async function fetchLastOmegaTp1Results(
  supabase: SupabaseClient,
  limit: number
): Promise<TradeResultRow[]> {
  const { data } = await supabase
    .from('bridge_trade_log')
    .select('result, created_at')
    .eq('engine_id', 'omega')
    .eq('leg_type', 'tp1')
    .eq('decision', 'EXECUTED')
    .not('result', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as TradeResultRow[];
}

export async function checkOmegaSlPause(
  supabase: SupabaseClient
): Promise<{ blocked: boolean; reason: string | null }> {
  const rows = await fetchLastOmegaTp1Results(supabase, CONSECUTIVE_SL_LIMIT);
  if (rows.length < CONSECUTIVE_SL_LIMIT) return { blocked: false, reason: null };

  const allLosses = rows.every(r => r.result === 'loss');
  if (!allLosses) return { blocked: false, reason: null };

  const mostRecentLossDate = new Date(rows[0]!.created_at);
  const pauseSession = getSessionLabel(mostRecentLossDate);
  const currentSession = getSessionLabel(new Date());
  if (pauseSession !== currentSession) return { blocked: false, reason: null };

  return {
    blocked: true,
    reason: `OMEGA_SL_PAUSE: ${CONSECUTIVE_SL_LIMIT} consecutive losses in ${currentSession} session`,
  };
}
