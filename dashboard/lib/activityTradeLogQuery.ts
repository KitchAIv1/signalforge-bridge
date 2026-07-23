import type { BridgeTradeLogRow } from '@/lib/types';
import { OMEGA_AO_BROKER_IDS } from '@/lib/omegaLaneBConstants';

export const ACTIVITY_TRADE_LOG_PAGE_SIZE = 50;

export const EXPANDED_TRADE_LOG_SELECT =
  'id, signal_id, engine_id, broker_id, pair, direction, decision, block_reason, status, result, ' +
  'confluence_score, units, risk_amount, pnl_dollars, fill_price, exit_price, stop_loss, ' +
  'take_profit, pnl_pips, pnl_r, lot_size, close_reason, duration_minutes, ' +
  'signal_received_at, created_at, regime_direction, regime_confidence, regime_evaluated_at, ' +
  'signal_session, close_tag, manual_tag, lane_advisory, ' +
  'layer4_result, layer4_bullish_count, layer4_bearish_count, ' +
  'layer5_result, layer5_pip_diff, layer6_position_pct, choppy_extended, amd_tag, direction_source, amd_size_multiplier, leg_type';

function aoBrokerListCsv(): string {
  return OMEGA_AO_BROKER_IDS.join(',');
}

/** PostgREST filter: exclude all ALPHAOMEGA venue ids (keep null broker rows). */
function excludeAoExecutedOrFilter(): string {
  return `broker_id.is.null,broker_id.not.in.(${aoBrokerListCsv()})`;
}

/** All-view: shared ledger + AO non-fills — never AO EXECUTED. */
function allViewExcludeAoExecutedOrFilter(): string {
  const csv = aoBrokerListCsv();
  return `broker_id.is.null,broker_id.not.in.(${csv}),and(broker_id.in.(${csv}),decision.neq.EXECUTED)`;
}

export function applyActivityDecisionFilter<T extends { eq: Function; in: Function }>(
  query: T,
  decisionFilter: string,
): T {
  if (decisionFilter) {
    query = query.eq('decision', decisionFilter) as T;
  }
  if (decisionFilter === 'EXECUTED') {
    query = query.in('status', ['open', 'closed']) as T;
  }
  return query;
}

/**
 * Activity broker scope:
 * - Explicit brokerId → that broker only.
 * - Explicit brokerIds → .in() (ALPHAOMEGA dual books).
 * - EXECUTED → exclude AO fills; keep broker_id NULL pre-exec rows.
 * - BLOCKED / SKIPPED / DEDUPLICATED → include AO (ALPHAOMEGA reasons).
 * - All ('') → shared ledger + AO non-fills only (no AO EXECUTED).
 */
export function applyActivityBrokerScope<T extends { eq: Function; or: Function; in: Function }>(
  query: T,
  brokerIdFilter: string,
  decisionFilter: string = 'EXECUTED',
  brokerIdsFilter?: readonly string[],
): T {
  if (brokerIdsFilter && brokerIdsFilter.length > 0) {
    return query.in('broker_id', [...brokerIdsFilter]) as T;
  }
  if (brokerIdFilter) {
    return query.eq('broker_id', brokerIdFilter) as T;
  }
  if (decisionFilter === 'EXECUTED') {
    return query.or(excludeAoExecutedOrFilter()) as T;
  }
  if (
    decisionFilter === 'BLOCKED' ||
    decisionFilter === 'SKIPPED' ||
    decisionFilter === 'DEDUPLICATED'
  ) {
    return query;
  }
  return query.or(allViewExcludeAoExecutedOrFilter()) as T;
}

export interface ActivityTradeLogFilters {
  decision: string;
  engineId: string;
  brokerId: string;
  /** When set, filters with .in(broker_id) instead of single eq. */
  brokerIds?: readonly string[];
}

export function buildActivityTradeLogQuery(
  supabase: ReturnType<typeof import('@/lib/supabase').getSupabase>,
  pageNum: number,
  filters: ActivityTradeLogFilters,
) {
  let q = supabase
    .from('bridge_trade_log')
    .select(EXPANDED_TRADE_LOG_SELECT)
    .order('created_at', { ascending: false })
    .range(
      pageNum * ACTIVITY_TRADE_LOG_PAGE_SIZE,
      (pageNum + 1) * ACTIVITY_TRADE_LOG_PAGE_SIZE - 1,
    );
  q = applyActivityDecisionFilter(q, filters.decision);
  if (filters.engineId) q = q.eq('engine_id', filters.engineId);
  q = applyActivityBrokerScope(q, filters.brokerId, filters.decision, filters.brokerIds);
  return q;
}

export type { BridgeTradeLogRow };
