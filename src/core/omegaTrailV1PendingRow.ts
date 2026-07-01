/**
 * Pre-insert-then-place helpers for Omega Trail v1 execution.
 *
 * The bridge_trade_log row is inserted BEFORE the broker order is placed, so a
 * confirmed fill is never left untracked (orphaned) if a later DB write fails.
 * The row starts as status='pending' — invisible to every open-trade gate
 * (all of which filter on status='open' AND oanda_trade_id IS NOT NULL) — and
 * is updated in place after the broker responds. It is never re-inserted, so
 * the broker-aware unique index (migration 054) can never self-collide.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '../utils/logger.js';

export interface PendingOmegaRow {
  rowId: string;
}

export async function insertPendingOmegaRow(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
  context: { signalId: string; brokerId: string },
): Promise<PendingOmegaRow | null> {
  const { data, error } = await supabase
    .from('bridge_trade_log')
    .insert({ ...row, status: 'pending' })
    .select('id')
    .single();

  if (error || !data) {
    logError('[Omega TrailV1] Pre-order bridge_trade_log insert failed — order NOT placed', {
      ...context,
      error: error?.message,
    });
    return null;
  }
  return { rowId: String((data as { id: unknown }).id) };
}

export async function markOmegaRowCancelled(
  supabase: SupabaseClient,
  rowId: string,
  cancelReason: string,
): Promise<void> {
  const { error } = await supabase
    .from('bridge_trade_log')
    .update({ decision: 'BLOCKED', block_reason: cancelReason })
    .eq('id', rowId);
  if (error) {
    logError('[Omega TrailV1] Failed to mark cancelled row as BLOCKED', {
      rowId,
      error: error.message,
    });
  }
}

export interface OmegaFillUpdate {
  oanda_order_id: string | undefined;
  oanda_trade_id: string | undefined;
  units: number;
  fill_price?: number;
  stop_loss?: number;
}

/**
 * Updates the pre-inserted row with fill details. Retries once on failure; if
 * both attempts fail, the broker trade is real but untracked in the DB — this
 * is logged as CRITICAL with every detail needed for manual reconciliation,
 * which is a strictly better outcome than the prior silent-drop behaviour.
 */
export async function applyOmegaFillUpdate(
  supabase: SupabaseClient,
  rowId: string,
  fillUpdate: OmegaFillUpdate,
  context: { signalId: string; brokerId: string },
): Promise<boolean> {
  const payload = { ...fillUpdate, status: 'open' };
  const { error } = await supabase.from('bridge_trade_log').update(payload).eq('id', rowId);
  if (!error) return true;

  const { error: retryError } = await supabase
    .from('bridge_trade_log')
    .update(payload)
    .eq('id', rowId);
  if (!retryError) return true;

  logError(
    '[Omega TrailV1] CRITICAL — broker fill confirmed but bridge_trade_log update failed ' +
      'twice. Manual reconciliation required.',
    { rowId, ...context, ...fillUpdate, error: retryError.message },
  );
  return false;
}
