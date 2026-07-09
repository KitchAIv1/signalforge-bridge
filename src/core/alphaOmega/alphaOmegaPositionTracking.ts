/**
 * ALPHAOMEGA open-position tracking — opposing-fire count (per open Lane B
 * position) and backstop-crack detection, both driven by the same fire
 * stream the streak tracker observes. Hard-stop (price-based) is handled
 * separately in src/monitoring/alphaOmegaHardStopMonitor.ts since it needs
 * continuous candle checks, not just fire-arrival checks.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveBrokerForLogRow } from '../../services/broker/resolveBrokerForLogRow.js';
import { closeTradeViaBroker } from '../../monitoring/brokerTradeLifecycle.js';
import { logInfo, logWarn } from '../../utils/logger.js';
import {
  ALPHAOMEGA_CLOSE_BACKSTOP_CRACK,
  ALPHAOMEGA_CLOSE_OPPOSING_COUNT,
  ALPHAOMEGA_CLOSE_OPPOSING_SHARE,
  OMEGA_LANE_B_BROKER_ID,
  OPPOSING_FIRE_COUNT_THRESHOLD,
  OPPOSING_SHARE_MIN_FIRES,
  OPPOSING_SHARE_THRESHOLD,
} from './alphaOmegaConstants.js';
import type { AlphaOmegaDirection, CrackEvent, StreakFireInput } from './alphaOmegaStreakTracker.js';

export interface AlphaOmegaPositionRow {
  oanda_trade_id: string;
  broker_id: string;
  direction: AlphaOmegaDirection;
  entry_fired_at: string;
  entry_price: number | null;
  opposing_fire_count: number;
  total_fire_count: number;
}

export async function loadOpenLaneBPositions(supabase: SupabaseClient): Promise<AlphaOmegaPositionRow[]> {
  const { data, error } = await supabase
    .from('alpha_omega_position_state')
    .select('oanda_trade_id, broker_id, direction, entry_fired_at, entry_price, opposing_fire_count, total_fire_count')
    .eq('broker_id', OMEGA_LANE_B_BROKER_ID);
  if (error) {
    logWarn('[AlphaOmega] loadOpenLaneBPositions failed', { error: error.message });
    return [];
  }
  return (data ?? []) as AlphaOmegaPositionRow[];
}

export async function registerAlphaOmegaPosition(
  supabase: SupabaseClient,
  params: { oandaTradeId: string; direction: AlphaOmegaDirection; entryFiredAt: string; entryPrice: number | null },
): Promise<void> {
  const { error } = await supabase.from('alpha_omega_position_state').insert({
    oanda_trade_id: params.oandaTradeId,
    broker_id: OMEGA_LANE_B_BROKER_ID,
    direction: params.direction,
    entry_fired_at: params.entryFiredAt,
    entry_price: params.entryPrice,
    opposing_fire_count: 0,
    total_fire_count: 0,
  });
  if (error) {
    logWarn('[AlphaOmega] registerAlphaOmegaPosition failed', { error: error.message, oandaTradeId: params.oandaTradeId });
  }
}

async function findLogRowIdForTrade(supabase: SupabaseClient, oandaTradeId: string): Promise<string | null> {
  const { data } = await supabase
    .from('bridge_trade_log')
    .select('id')
    .eq('oanda_trade_id', oandaTradeId)
    .eq('status', 'open')
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * Closes one Lane B position: resolves the correct broker (fixes the same
 * class of routing bug found in omegaClosePositions.ts, for this path from
 * day one), closes at the broker, updates bridge_trade_log, removes the
 * position_state row.
 */
export async function closeAlphaOmegaPosition(
  supabase: SupabaseClient,
  position: AlphaOmegaPositionRow,
  reason: string,
): Promise<void> {
  try {
    const logRowId = await findLogRowIdForTrade(supabase, position.oanda_trade_id);
    const broker = await resolveBrokerForLogRow(supabase, position.broker_id, 'omega');
    const { closedAt, pnlDollars, exitPriceNum } = await closeTradeViaBroker(broker, position.oanda_trade_id);

    if (logRowId) {
      let pnlPips: number | null = null;
      if (exitPriceNum != null && position.entry_price != null) {
        const move = position.direction === 'LONG'
          ? exitPriceNum - position.entry_price
          : position.entry_price - exitPriceNum;
        pnlPips = Math.round((move / 0.0001) * 10) / 10;
      }
      const { error: updateErr } = await supabase
        .from('bridge_trade_log')
        .update({
          status: 'closed',
          close_reason: reason,
          closed_at: closedAt,
          exit_price: exitPriceNum,
          pnl_dollars: pnlDollars,
          pnl_pips: pnlPips,
          result: pnlDollars == null ? 'breakeven' : pnlDollars > 0 ? 'win' : pnlDollars < 0 ? 'loss' : 'breakeven',
        })
        .eq('id', logRowId);
      if (updateErr) {
        logWarn('[AlphaOmega] bridge_trade_log update after close failed', { error: updateErr.message, oandaTradeId: position.oanda_trade_id });
      }
    }

    await supabase.from('alpha_omega_position_state').delete().eq('oanda_trade_id', position.oanda_trade_id);

    logInfo('[AlphaOmega] Closed Lane B position', {
      oandaTradeId: position.oanda_trade_id,
      reason,
      pnlDollars,
    });
  } catch (err) {
    logWarn('[AlphaOmega] closeAlphaOmegaPosition failed', { oandaTradeId: position.oanda_trade_id, error: String(err) });
  }
}

export interface FireTrackingResult {
  /** True only if a position closed via backstop_crack on THIS exact fire — the
   * one case where the closing fire legitimately doubles as the next entry
   * trigger (same underlying "crack" event drives both). For any other close
   * reason (opposing_count, opposing_share, hard_stop — hard_stop can't happen
   * here since it's price-driven, not fire-driven, but included for
   * completeness), the entry gate must NOT fire on this same fire even if it
   * coincidentally also looks like a qualifying crack — it must wait for a
   * genuinely later one. This mirrors the validated batch backtest exactly:
   * only `trigger === 'backstop_crack'` chains directly into the next entry;
   * every other exit trigger skips forward to the next STRICTLY LATER candidate.
   */
  backstopCrackDirection: AlphaOmegaDirection | null;
  /** True if any position closed on this fire for a reason OTHER than backstop_crack. */
  closedForOtherReason: boolean;
}

/**
 * Called once per incoming omega fire (from the fan-out hook). Increments
 * the opposing-fire count for every open Lane B position whose direction
 * differs from this fire, closing any that cross the threshold (or the
 * opposing-share backup threshold). Also closes any open position whose
 * direction matches this fire's crackEvent brokenDirection (the backstop:
 * our own direction just reconfirmed a full streak and cracked).
 */
export async function trackFireAgainstOpenPositions(
  supabase: SupabaseClient,
  fire: StreakFireInput,
  crackEvent: CrackEvent | null,
): Promise<FireTrackingResult> {
  const result: FireTrackingResult = { backstopCrackDirection: null, closedForOtherReason: false };
  const positions = await loadOpenLaneBPositions(supabase);
  if (positions.length === 0) return result;

  for (const position of positions) {
    // Priority order matters and MUST match the validated batch backtest exactly:
    // opposing_count / opposing_share are checked FIRST (they mirror the batch's
    // cursor-walk, which checks these on every fire inside the loop); backstop_crack
    // is only the FALLBACK label when this exact fire doesn't independently trigger
    // one of those thresholds. Checking backstop first (as an earlier version of
    // this code did) flips the tie-break in the rare case a fire satisfies both
    // simultaneously, which then incorrectly allows an immediate same-fire
    // re-entry that the batch backtest does not take.
    const nextTotal = position.total_fire_count + 1;
    const nextOpposing = fire.direction !== position.direction ? position.opposing_fire_count + 1 : position.opposing_fire_count;

    if (nextOpposing >= OPPOSING_FIRE_COUNT_THRESHOLD) {
      await closeAlphaOmegaPosition(supabase, position, ALPHAOMEGA_CLOSE_OPPOSING_COUNT);
      result.closedForOtherReason = true;
      continue;
    }
    if (nextTotal >= OPPOSING_SHARE_MIN_FIRES && nextOpposing / nextTotal >= OPPOSING_SHARE_THRESHOLD) {
      await closeAlphaOmegaPosition(supabase, position, ALPHAOMEGA_CLOSE_OPPOSING_SHARE);
      result.closedForOtherReason = true;
      continue;
    }
    if (crackEvent && crackEvent.brokenDirection === position.direction) {
      await closeAlphaOmegaPosition(supabase, position, ALPHAOMEGA_CLOSE_BACKSTOP_CRACK);
      result.backstopCrackDirection = crackEvent.enterDirection;
      continue;
    }
    if (nextOpposing !== position.opposing_fire_count || nextTotal !== position.total_fire_count) {
      const { error } = await supabase
        .from('alpha_omega_position_state')
        .update({ opposing_fire_count: nextOpposing, total_fire_count: nextTotal, updated_at: new Date().toISOString() })
        .eq('oanda_trade_id', position.oanda_trade_id);
      if (error) {
        logWarn('[AlphaOmega] opposing_fire_count update failed', { error: error.message, oandaTradeId: position.oanda_trade_id });
      }
    }
  }
  return result;
}
