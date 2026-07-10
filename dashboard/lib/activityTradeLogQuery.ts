import type { BridgeTradeLogRow } from '@/lib/types';
import { OMEGA_LANE_B_BROKER_ID } from '@/lib/omegaLaneBConstants';

export const ACTIVITY_TRADE_LOG_PAGE_SIZE = 50;

export const EXPANDED_TRADE_LOG_SELECT =
  'id, signal_id, engine_id, broker_id, pair, direction, decision, block_reason, status, result, ' +
  'confluence_score, units, risk_amount, pnl_dollars, fill_price, exit_price, stop_loss, ' +
  'take_profit, pnl_pips, pnl_r, lot_size, close_reason, duration_minutes, ' +
  'signal_received_at, created_at, regime_direction, regime_confidence, regime_evaluated_at, ' +
  'signal_session, close_tag, manual_tag, lane_advisory, ' +
  'layer4_result, layer4_bullish_count, layer4_bearish_count, ' +
  'layer5_result, layer5_pip_diff, layer6_position_pct, choppy_extended, amd_tag, direction_source, amd_size_multiplier, leg_type';

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
 * - Explicit brokerId → that broker only (/omega-phase2).
 * - EXECUTED → exclude Lane B fills; keep broker_id NULL pre-exec rows.
 * - BLOCKED / SKIPPED / DEDUPLICATED → include Lane B (ALPHAOMEGA reasons).
 * - All ('') → shared ledger + Lane B non-fills only (no Lane B EXECUTED).
 */
export function applyActivityBrokerScope<T extends { eq: Function; or: Function }>(
  query: T,
  brokerIdFilter: string,
  decisionFilter: string = 'EXECUTED',
): T {
  if (brokerIdFilter) {
    return query.eq('broker_id', brokerIdFilter) as T;
  }
  if (decisionFilter === 'EXECUTED') {
    // Pre-execution rows store broker_id NULL — neq alone would drop them.
    return query.or(`broker_id.is.null,broker_id.neq.${OMEGA_LANE_B_BROKER_ID}`) as T;
  }
  if (
    decisionFilter === 'BLOCKED' ||
    decisionFilter === 'SKIPPED' ||
    decisionFilter === 'DEDUPLICATED'
  ) {
    return query;
  }
  // All: Lane A + null-broker + Lane B blocks/skips — never Lane B fills.
  return query.or(
    `broker_id.is.null,broker_id.neq.${OMEGA_LANE_B_BROKER_ID},and(broker_id.eq.${OMEGA_LANE_B_BROKER_ID},decision.neq.EXECUTED)`,
  ) as T;
}

export interface ActivityTradeLogFilters {
  decision: string;
  engineId: string;
  brokerId: string;
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
  q = applyActivityBrokerScope(q, filters.brokerId, filters.decision);
  return q;
}

export type { BridgeTradeLogRow };
