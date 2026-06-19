/**
 * Omega T1-loss skip gate.
 *
 * After a T1 loss (the tp1 leg of an omega ratchet closes with result='loss'),
 * the very next omega signal is skipped. The skip is consumed once — the signal
 * after the skipped one is allowed regardless of the prior loss.
 *
 * Leg-aware: keys strictly off the tp1 leg (the momentum proxy that the
 * backtest validated). Robust to multi-leg logging (tp1/tp2/trail), since a
 * single signal writes three rows once the ratchet-leg constraint is in place.
 *
 * Skip-consumption is timestamp-based: a loss is "paid" once a
 * OMEGA_T1_LOSS_SKIP block row exists with created_at after the loss close.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const OMEGA_T1_LOSS_SKIP_REASON = 'OMEGA_T1_LOSS_SKIP';

export async function checkOmegaT1LossSkip(
  supabase: SupabaseClient
): Promise<{ blocked: boolean; reason?: string }> {
  // Most recent closed tp1 leg with a definitive result.
  const { data: tp1Rows, error: tp1Err } = await supabase
    .from('bridge_trade_log')
    .select('result, closed_at, created_at')
    .eq('engine_id', 'omega')
    .eq('leg_type', 'tp1')
    .eq('decision', 'EXECUTED')
    .not('result', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (tp1Err || !tp1Rows || tp1Rows.length === 0) return { blocked: false };

  const lastTp1 = tp1Rows[0];
  if (lastTp1.result !== 'loss') return { blocked: false };

  const lossTimeMs = new Date(
    (lastTp1.closed_at as string) ?? (lastTp1.created_at as string)
  ).getTime();

  // Has a skip already been consumed for this loss?
  const { data: skipRows } = await supabase
    .from('bridge_trade_log')
    .select('created_at')
    .eq('engine_id', 'omega')
    .eq('decision', 'BLOCKED')
    .ilike('block_reason', `${OMEGA_T1_LOSS_SKIP_REASON}%`)
    .order('created_at', { ascending: false })
    .limit(1);

  const lastSkip = skipRows && skipRows.length > 0 ? skipRows[0] : null;
  if (
    lastSkip &&
    new Date(lastSkip.created_at as string).getTime() > lossTimeMs
  ) {
    // A signal was already skipped after this loss — allow now.
    return { blocked: false };
  }

  return {
    blocked: true,
    reason: `${OMEGA_T1_LOSS_SKIP_REASON}: skipping one signal after T1 loss`,
  };
}
