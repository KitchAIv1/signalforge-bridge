import type {
  AccumulationRow,
  AmdPerformanceRow,
  DirectionSourceRow,
  ObsThreshold,
  TimeGateRow,
} from '@/lib/intelligenceTypes';

type HourBandByTag = Record<string, { entry: number; exit: number }>;

type TaggedTradeSample = {
  amd_tag: string;
  direction_source: string | null;
  amd_size_multiplier: number | null;
  pnl_r: number;
  result: string;
  created_at: string;
};

type AmdAccumulationSample = {
  asian_range_pips: number | null;
  asian_is_flat: boolean | null;
  amd_tag: string;
};

function hourInBand(utcHour: number, amdTagLabel: string, bands: HourBandByTag): boolean {
  const band = bands[amdTagLabel];
  if (!band) return false;
  return utcHour >= band.entry && utcHour <= band.exit;
}

type HourBucketAggregate = {
  amd_tag: string;
  utc_hour: number;
  pnls: number[];
  wins: number;
};

function ensureHourAggregate(
  map: Map<string, HourBucketAggregate>,
  amdTagLabel: string,
  utcHour: number,
): HourBucketAggregate {
  const groupingKey = `${amdTagLabel}|${utcHour}`;
  let agg = map.get(groupingKey);
  if (!agg) {
    agg = { amd_tag: amdTagLabel, utc_hour: utcHour, pnls: [], wins: 0 };
    map.set(groupingKey, agg);
  }
  return agg;
}

function ingestTradeHour(aggRoot: HourBucketAggregate, taggedTrade: TaggedTradeSample): void {
  aggRoot.pnls.push(taggedTrade.pnl_r);
  if (taggedTrade.result === 'win') aggRoot.wins += 1;
}

function aggregateTimeGateRows(taggedTrades: TaggedTradeSample[], bands: HourBandByTag): TimeGateRow[] {
  const aggregates = new Map<string, HourBucketAggregate>();

  for (const taggedTrade of taggedTrades) {
    const utcHour = new Date(taggedTrade.created_at).getUTCHours();
    const grouping = ensureHourAggregate(aggregates, taggedTrade.amd_tag, utcHour);
    ingestTradeHour(grouping, taggedTrade);
  }

  const gateRows: TimeGateRow[] = [];
  for (const [, grouping] of aggregates) {
    const bucketN = grouping.pnls.length;
    const sumR = grouping.pnls.reduce((sum, rv) => sum + rv, 0);
    gateRows.push({
      amd_tag: grouping.amd_tag,
      utc_hour: grouping.utc_hour,
      n_trades: bucketN,
      avg_pnl_r: Number((sumR / Math.max(bucketN, 1)).toFixed(3)),
      win_rate_pct: Number(
        ((grouping.wins / Math.max(bucketN, 1)) * 100).toFixed(1),
      ),
      in_optimal_window: hourInBand(grouping.utc_hour, grouping.amd_tag, bands),
    });
  }

  gateRows.sort(
    (left, right) =>
      left.amd_tag.localeCompare(right.amd_tag) || left.utc_hour - right.utc_hour,
  );
  return gateRows;
}

function mapTaggedPerformance(tradesBatch: TaggedTradeSample[]): AmdPerformanceRow[] {
  type Accum = { wins: number; n: number; total_r: number; total_multiplier: number };
  const byTag = new Map<string, Accum>();

  for (const tradeSample of tradesBatch) {
    if (!byTag.has(tradeSample.amd_tag)) {
      byTag.set(tradeSample.amd_tag, { wins: 0, n: 0, total_r: 0, total_multiplier: 0 });
    }
    const slot = byTag.get(tradeSample.amd_tag)!;
    slot.n += 1;
    slot.total_r += tradeSample.pnl_r;
    slot.total_multiplier += tradeSample.amd_size_multiplier ?? 1;
    if (tradeSample.result === 'win') slot.wins += 1;
  }

  const rows: AmdPerformanceRow[] = [];
  for (const [tagLabel, slot] of byTag) {
    rows.push({
      amd_tag: tagLabel,
      n_trades: slot.n,
      avg_pnl_r: Number((slot.total_r / Math.max(slot.n, 1)).toFixed(3)),
      win_rate_pct: Number(((slot.wins / Math.max(slot.n, 1)) * 100).toFixed(1)),
      avg_size_multiplier: Number(
        (slot.total_multiplier / Math.max(slot.n, 1)).toFixed(2),
      ),
    });
  }

  rows.sort((left, right) => right.n_trades - left.n_trades);
  return rows;
}

function mapDirectionSources(batch: TaggedTradeSample[]): DirectionSourceRow[] {
  type TotalsEntry = { wins: number; n: number; total_r: number };
  const rollup = new Map<string, TotalsEntry>();

  for (const tradeSample of batch) {
    const sourceKey = tradeSample.direction_source ?? 'unknown';
    if (!rollup.has(sourceKey)) rollup.set(sourceKey, { wins: 0, n: 0, total_r: 0 });
    const slot = rollup.get(sourceKey)!;
    slot.n += 1;
    slot.total_r += tradeSample.pnl_r;
    if (tradeSample.result === 'win') slot.wins += 1;
  }

  const assembled: DirectionSourceRow[] = [];
  for (const [directionLabel, slot] of rollup) {
    assembled.push({
      direction_source: directionLabel,
      n_trades: slot.n,
      avg_pnl_r: Number((slot.total_r / Math.max(slot.n, 1)).toFixed(3)),
      win_rate_pct: Number(((slot.wins / Math.max(slot.n, 1)) * 100).toFixed(1)),
    });
  }
  return assembled;
}

function buildAccumBuckets(rowsSlice: AmdAccumulationSample[]): AccumulationRow[] {
  type RowKey = string;
  const bucketMap = new Map<
    RowKey,
    { range_bucket: string; asian_is_flat: boolean | null; amd_tag: string; n: number }
  >();

  for (const amdRow of rowsSlice) {
    if (amdRow.asian_range_pips === null) continue;
    const bucketLabel =
      amdRow.asian_range_pips < 35
        ? 'under_35'
        : amdRow.asian_range_pips <= 49
          ? 'transition_35_49'
          : 'over_50';
    const flatPart =
      amdRow.asian_is_flat === null ? 'null' : String(amdRow.asian_is_flat);
    const rowKey = `${bucketLabel}|${flatPart}|${amdRow.amd_tag}`;
    let slotRef = bucketMap.get(rowKey);
    if (!slotRef) {
      slotRef = {
        range_bucket: bucketLabel,
        asian_is_flat: amdRow.asian_is_flat,
        amd_tag: amdRow.amd_tag,
        n: 0,
      };
      bucketMap.set(rowKey, slotRef);
    }
    slotRef.n += 1;
  }

  const bucketList = [...bucketMap.values()].sort((left, right) =>
    left.range_bucket.localeCompare(right.range_bucket),
  );
  return bucketList;
}

function flattenTransitionSamples(stateRows: AmdAccumulationSample[]): number {
  return stateRows.filter(
    (r) =>
      r.asian_range_pips !== null &&
      r.asian_range_pips >= 35 &&
      r.asian_range_pips <= 49 &&
      r.asian_is_flat === true,
  ).length;
}

function observationAsianRange(flatTransitions: number): ObsThreshold {
  return {
    id: 'OBS-001',
    label: 'Asian Range Threshold (35 pip boundary)',
    hypothesis:
      'Days with Asian range 35-49 pips + flat + clean Judas may be misclassified as SHIFTED. 89-100% Judas inversion accuracy found in backtest on n=3,12 — too small to act.',
    current_n: flatTransitions,
    threshold_n: 50,
    status:
      flatTransitions >= 50
        ? 'READY_TO_ACT'
        : flatTransitions >= 35
          ? 'APPROACHING'
          : 'WATCHING',
    action_when_ready:
      'Re-run amdAsianRangeThresholdBacktest.ts. If 40-pip threshold shows >70% TEXTBOOK accuracy, raise boundary.',
  };
}

function observationHourGateDistribution(tradeCount: number): ObsThreshold {
  return {
    id: 'OBS-002',
    label: 'Distribution Hour Gate Per AMD Tag',
    hypothesis:
      'Each AMD tag has a validated optimal entry hour from 272-day backtest. COMPRESSION_BREAKOUT hour 10 = 94%, TEXTBOOK hour 12 = 80%, SHIFTED hour 12 = 69%, hour 10 = 48%.',
    current_n: tradeCount,
    threshold_n: 75,
    status:
      tradeCount >= 75 ? 'READY_TO_ACT' : tradeCount >= 50 ? 'APPROACHING' : 'WATCHING',
    action_when_ready:
      'Compare inside vs outside optimal window P&L per tag. If inside window outperforms by >0.3R avg, implement BUILD-001 shadow logging then BUILD-003 delayed write.',
  };
}

function observationExitDegrade(tradeCount: number): ObsThreshold {
  return {
    id: 'OBS-003',
    label: 'Distribution Exit Degradation (Hours 14-15 UTC)',
    hypothesis:
      'Hours 14-15 UTC degrade for all AMD tags. Distribution peaks by hour 13. Holding past optimal exit hour costs P&L.',
    current_n: tradeCount,
    threshold_n: 100,
    status:
      tradeCount >= 100 ? 'READY_TO_ACT' : tradeCount >= 70 ? 'APPROACHING' : 'WATCHING',
    action_when_ready:
      'Analyze P&L by entry hour and close_reason. If trail_stop exits after hour 13 show negative avg R, implement dynamic max hold per AMD tag.',
  };
}

function observationShiftedJudas(): ObsThreshold {
  return {
    id: 'OBS-004',
    label: 'SHIFTED Strong Judas Override (Reverted)',
    hypothesis:
      'v2.4.2 Judas inversion on SHIFTED days reverted — D1 bias 71% vs Judas inversion 56%. Open question: flat Asian + strong Judas SHIFTED days specifically — needs directional split reanalysis.',
    current_n: 0,
    threshold_n: 30,
    status: 'WATCHING',
    action_when_ready:
      'Rerun inversion vs D1 comparison filtered to asian_is_flat=true + judas_pips>=8 SHIFTED days only. If inversion >71% on this subset, reintroduce with flat-only gate.',
  };
}

function buildObservationRows(flatTransitions: number, tradeCount: number): ObsThreshold[] {
  return [
    observationAsianRange(flatTransitions),
    observationHourGateDistribution(tradeCount),
    observationExitDegrade(tradeCount),
    observationShiftedJudas(),
  ];
}

export function buildIntelDashboardSlices(
  amdAccumRows30d: AmdAccumulationSample[],
  taggedOmegaExecuted: TaggedTradeSample[],
  hourBandsByTag: HourBandByTag,
): {
  time_gate_rows: TimeGateRow[];
  amd_performance: AmdPerformanceRow[];
  direction_source: DirectionSourceRow[];
  accumulation_rows: AccumulationRow[];
  obs_thresholds: ObsThreshold[];
} {
  return {
    time_gate_rows: aggregateTimeGateRows(taggedOmegaExecuted, hourBandsByTag),
    amd_performance: mapTaggedPerformance(taggedOmegaExecuted),
    direction_source: mapDirectionSources(taggedOmegaExecuted),
    accumulation_rows: buildAccumBuckets(amdAccumRows30d),
    obs_thresholds: buildObservationRows(
      flattenTransitionSamples(amdAccumRows30d),
      taggedOmegaExecuted.length,
    ),
  };
}
