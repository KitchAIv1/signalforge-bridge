import { getSupabase } from '@/lib/supabase';
import type { ShadowTrailPayload, ShadowTrailRow, ShadowTrailSummary } from '@/lib/shadowTrailTypes';

const SELECT =
  'signal_id, fired_at, trade_date, direction, session_window, filter_passed, filter_reason, shadow_pips_net, shadow_win, sequenced_status, sequenced_pips_net, live_pnl_pips, live_result';

function readNum(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function buildSummary(rows: ShadowTrailRow[]): ShadowTrailSummary {
  let shadowUngatedTotal = 0;
  let shadowSequencedTotal = 0;
  let liveTotal = 0;
  let filteredCount = 0;
  let sequencedExecuted = 0;
  let sequencedBlocked = 0;
  for (const row of rows) {
    if (row.filter_passed) filteredCount += 1;
    if (row.shadow_pips_net != null && row.filter_passed) {
      shadowUngatedTotal += readNum(row.shadow_pips_net);
    }
    if (row.sequenced_status === 'executed' && row.sequenced_pips_net != null) {
      shadowSequencedTotal += readNum(row.sequenced_pips_net);
      sequencedExecuted += 1;
    }
    if (row.sequenced_status === 'blocked') sequencedBlocked += 1;
    if (row.live_pnl_pips != null) liveTotal += readNum(row.live_pnl_pips);
  }
  return {
    rowCount: rows.length,
    filteredCount,
    shadowUngatedTotal,
    shadowSequencedTotal,
    liveTotal,
    sequencedExecuted,
    sequencedBlocked,
  };
}

export async function fetchShadowTrailData(days: number = 14): Promise<ShadowTrailPayload> {
  const supabase = getSupabase();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('omega_shadow_trail_exit')
    .select(SELECT)
    .gte('trade_date', since)
    .order('fired_at', { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ShadowTrailRow[];
  return { rows, summary: buildSummary(rows) };
}
