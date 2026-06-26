import type { AmdState } from '@/lib/types';

/** Narrow amd_state slice joined onto Asian session history by trade_date. */
export type AsianSessionAmdMetricsSlice = Pick<
  AmdState,
  | 'trade_date'
  | 'asian_close_bias_signal'
  | 'asian_close_position_pct'
  | 'accumulation_quality_score'
  | 'asian_shape'
  | 'asian_retracement_pct'
  | 'asian_turn_time'
  | 'asian_turn_position'
> & {
  evaluated_at: string | null;
};

export type AsianSessionAmdMetricsDisplayState = 'ready' | 'pending' | 'missing';

export function buildAsianSessionAmdMetricsMap(
  rows: readonly AsianSessionAmdMetricsSlice[],
): ReadonlyMap<string, AsianSessionAmdMetricsSlice> {
  const metricsMap = new Map<string, AsianSessionAmdMetricsSlice>();
  for (const row of rows) {
    metricsMap.set(row.trade_date, row);
  }
  return metricsMap;
}

export function resolveAsianSessionAmdMetricsDisplayState(
  tradeDate: string,
  metrics: AsianSessionAmdMetricsSlice | undefined,
  referenceNow: Date = new Date(),
): AsianSessionAmdMetricsDisplayState {
  if (metrics?.evaluated_at) return 'ready';
  const todayUtc = referenceNow.toISOString().slice(0, 10);
  if (tradeDate === todayUtc) return 'pending';
  return 'missing';
}
