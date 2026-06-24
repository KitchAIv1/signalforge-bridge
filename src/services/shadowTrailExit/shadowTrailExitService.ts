/** Resolve shadow Trail v1 for pending omega tp1 signals. */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logInfo, logWarn } from '../../utils/logger.js';
import { applySequencedGate } from './applySequencedGate.js';
import { fetchM5BarsAfterEntry } from './fetchEntryCandles.js';
import { loadLiveLegPnl, loadPendingOmegaSignals } from './loadPendingSignals.js';
import { refreshStaleLivePnl } from './refreshStaleLivePnl.js';
import { simulateTrailV1 } from './trailV1Sim.js';
import {
  SHADOW_EXECUTION_COST_PIPS,
  type ShadowTrailRow,
} from './types.js';
import { evaluateWindowFilter, utcTradeDate } from './windowFilter.js';

async function loadAmdDirection(
  supabase: SupabaseClient,
  tradeDate: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('amd_state')
    .select('decision_auto_direction')
    .eq('trade_date', tradeDate)
    .maybeSingle();
  return data?.decision_auto_direction != null
    ? String(data.decision_auto_direction)
    : null;
}

async function loadOmegaDirection(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', 'omega_direction')
    .maybeSingle();
  const raw = data?.config_value;
  return typeof raw === 'string' ? raw.replace(/^"|"$/g, '') : null;
}

async function buildShadowRow(
  supabase: SupabaseClient,
  pending: Awaited<ReturnType<typeof loadPendingOmegaSignals>>[number],
  omegaDirection: string | null,
): Promise<ShadowTrailRow> {
  const tradeDate = utcTradeDate(pending.firedAt);
  const amdDirection = await loadAmdDirection(supabase, tradeDate);
  const filter = evaluateWindowFilter(
    pending.firedAt,
    pending.direction,
    omegaDirection,
    amdDirection,
  );
  const liveLeg = await loadLiveLegPnl(supabase, pending.signalId);
  const base: ShadowTrailRow = {
    signal_id: pending.signalId,
    trade_log_id: pending.tradeLogId,
    fired_at: pending.firedAt,
    trade_date: tradeDate,
    direction: pending.direction,
    entry_price: pending.entryPrice,
    r_pips: pending.rPips,
    r_size_raw: pending.rSizeRaw,
    session_window: filter.sessionWindow,
    filter_passed: filter.filterPassed,
    filter_reason: filter.filterReason,
    expected_direction: filter.expectedDirection,
    shadow_exit_type: null,
    shadow_pips_gross: null,
    shadow_pips_net: null,
    shadow_exit_bars: null,
    shadow_win: null,
    execution_cost_pips: SHADOW_EXECUTION_COST_PIPS,
    sequenced_status: 'skipped',
    sequenced_pips_net: null,
    live_pnl_pips: liveLeg.pnlPips ?? pending.livePnlPips,
    live_result: liveLeg.result ?? pending.liveResult,
    resolved_at: new Date().toISOString(),
  };
  if (!filter.filterPassed) return base;

  const bars = await fetchM5BarsAfterEntry('AUD_USD', pending.firedAt);
  if (bars.length < 2) {
    return {
      ...base,
      filter_passed: false,
      filter_reason: 'insufficient_m5_bars',
    };
  }
  const outcome = simulateTrailV1(pending.direction, pending.entryPrice, pending.rSizeRaw, bars);
  return {
    ...base,
    shadow_exit_type: outcome.exitType,
    shadow_pips_gross: outcome.grossPips,
    shadow_pips_net: outcome.netPips,
    shadow_exit_bars: outcome.exitBars,
    shadow_win: outcome.win,
  };
}

export async function runShadowTrailExitResolver(
  supabase: SupabaseClient,
): Promise<{ inserted: number; resequenced: number; liveRefreshed: number }> {
  const liveRefreshed = await refreshStaleLivePnl(supabase);
  const pending = await loadPendingOmegaSignals(supabase, 40);
  if (pending.length === 0) {
    logInfo('[ShadowTrail] resolver done', { inserted: 0, resequenced: 0, liveRefreshed });
    return { inserted: 0, resequenced: 0, liveRefreshed };
  }

  const omegaDirection = await loadOmegaDirection(supabase);
  const newRows: ShadowTrailRow[] = [];
  for (const signal of pending) {
    try {
      newRows.push(await buildShadowRow(supabase, signal, omegaDirection));
    } catch (err: unknown) {
      logWarn('[ShadowTrail] row failed', { signalId: signal.signalId, err: String(err) });
    }
  }
  if (newRows.length === 0) {
    logInfo('[ShadowTrail] resolver done', { inserted: 0, resequenced: 0, liveRefreshed });
    return { inserted: 0, resequenced: 0, liveRefreshed };
  }

  const { error } = await supabase.from('omega_shadow_trail_exit').upsert(newRows, {
    onConflict: 'signal_id',
  });
  if (error) throw new Error(`[ShadowTrail] upsert: ${error.message}`);

  const resequenced = await resequenceRecentDays(supabase);
  logInfo('[ShadowTrail] resolver done', { inserted: newRows.length, resequenced, liveRefreshed });
  return { inserted: newRows.length, resequenced, liveRefreshed };
}

async function resequenceRecentDays(supabase: SupabaseClient): Promise<number> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('omega_shadow_trail_exit')
    .select('*')
    .gte('trade_date', since);
  if (error || !data?.length) return 0;

  const gated = applySequencedGate(data as ShadowTrailRow[]);
  const { error: updateErr } = await supabase
    .from('omega_shadow_trail_exit')
    .upsert(gated, { onConflict: 'signal_id' });
  if (updateErr) throw new Error(`[ShadowTrail] resequence: ${updateErr.message}`);
  return gated.length;
}
