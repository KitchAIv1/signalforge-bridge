/**
 * Omega T1-loss skip gate.
 *
 * After a T1 loss (omega trade closes with result='loss'), the very next
 * omega signal is skipped. The skip is consumed immediately — the signal
 * after the skipped one is allowed regardless.
 *
 * Logic (checked against bridge_trade_log ordered by created_at desc):
 *   1. Find the most recent omega event (any decision).
 *   2. If it is a BLOCKED row with reason 'OMEGA_T1_LOSS_SKIP' → skip already
 *      consumed → allow this signal.
 *   3. If it is a closed trade with result='loss' → first signal after the loss
 *      → block with reason 'OMEGA_T1_LOSS_SKIP'.
 *   4. Otherwise → allow.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const OMEGA_T1_LOSS_SKIP_REASON = 'OMEGA_T1_LOSS_SKIP';

export async function checkOmegaT1LossSkip(
  supabase: SupabaseClient
): Promise<{ blocked: boolean; reason?: string }> {
  const { data: rows, error } = await supabase
    .from('bridge_trade_log')
    .select('decision, block_reason, result, status, created_at')
    .eq('engine_id', 'omega')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !rows || rows.length === 0) return { blocked: false };

  const last = rows[0];

  // Skip already consumed — the previous signal was the skipped one.
  if (
    last.decision === 'BLOCKED' &&
    typeof last.block_reason === 'string' &&
    last.block_reason.startsWith(OMEGA_T1_LOSS_SKIP_REASON)
  ) {
    return { blocked: false };
  }

  // Last event was a closed loss trade → this is the first signal after the loss.
  if (last.status === 'closed' && last.result === 'loss') {
    return {
      blocked: true,
      reason: `${OMEGA_T1_LOSS_SKIP_REASON}: skipping one signal after T1 loss`,
    };
  }

  return { blocked: false };
}
