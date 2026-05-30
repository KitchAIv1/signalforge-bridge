import type { M5Bar } from '../regimeVsAmd/regimeVsAmdM5Walk.js';

export type DailyCloseDirection = 'LONG' | 'SHORT' | 'DOJI';
export type ProductionDirection = 'long' | 'short' | 'neutral';

export type OandaCandle = {
  time: string;
  mid: { o: string; h: string; l: string; c: string };
  complete: boolean;
};

export type AsianCleanTrendJoin = {
  prior_d1_direction: string | null;
  prior_d1_body_pips: number | null;
  prior_d1_range_pips: number | null;
  weekly_open_bias: string | null;
};

export type AmdDolJoinedRow = {
  trade_date: string;
  amd_tag: string | null;
  daily_bias_alignment: string | null;
  auto_direction: string | null;
  amd_outcome_tag: string | null;
  layer4_d1_bias: string | null;
  layer4_bullish_count: number | null;
  layer4_bearish_count: number | null;
  layer4_d1_bias_7: string | null;
  layer4_bullish_count_7: number | null;
  layer4_bearish_count_7: number | null;
  m5_vs_judas_direction: string | null;
  judas_direction: string | null;
  judas_pips: number | null;
  judas_extreme_price: number | null;
  asian_range_pips: number | null;
  asian_is_flat: boolean | null;
  chart_data: Record<string, unknown> | null;
  m5Candles: M5Bar[];
  cleanTrend: AsianCleanTrendJoin | null;
};

export type JoinLoadStats = {
  amdStateTotal: number;
  m5SuccessMapSize: number;
  cleanTrendMapSize: number;
  cohortRows: number;
  cleanTrendMatched: number;
  cleanTrendMissingDates: string[];
  skippedNoM5: number;
  insufficientDataExcluded: number;
  insufficientDataDates: string[];
};

export type DailyLevels = {
  prevDayHigh: number | null;
  prevDayLow: number | null;
  prevDayClose: number | null;
  dailyOpen: number | null;
  dailyClose: number | null;
  dailyHigh: number | null;
  dailyLow: number | null;
  dailyCandleTimeRaw: string | null;
};

export type OandaLevels = DailyLevels & {
  prevWeekHigh: number | null;
  prevWeekLow: number | null;
  weeklyOpen: number | null;
  monthlyOpen: number | null;
  weeklyMonthlySource: string;
};

export type AsianMetrics = {
  asianHigh: number | null;
  asianLow: number | null;
  asianOpen: number | null;
  asianClose: number | null;
  asianClosePositionPct: number | null;
  asianCloseBias: string | null;
};

export type TopDownSignals = {
  weeklyOpenBias: string | null;
  monthlyOpenBias: string | null;
  prevDayPosition: string | null;
  asianSweptPrevLow: boolean | null;
  asianSweptPrevHigh: boolean | null;
  judasSweptPrevLow: boolean | null;
  judasSweptPrevHigh: boolean | null;
};

export type PredictionBundle = {
  predictedJudasInversionRaw: ProductionDirection;
  predictedAutoDirection: ProductionDirection;
  predictedProduction: ProductionDirection;
};

export type DolBacktestRow = {
  trade_date: string;
  amd_tag: string | null;
  daily_bias_alignment: string | null;
  layer4_d1_bias: string | null;
  layer4_bullish_count: number | null;
  layer4_bearish_count: number | null;
  layer4_d1_bias_7: string | null;
  layer4_bullish_count_7: number | null;
  layer4_bearish_count_7: number | null;
  m5_vs_judas_direction: string | null;
  judas_direction: string | null;
  judas_pips: number | null;
  judas_extreme_price: number | null;
  asian_range_pips: number | null;
  asian_is_flat: boolean | null;
  asian_high: number | null;
  asian_low: number | null;
  asian_open: number | null;
  asian_close: number | null;
  asian_close_position_pct: number | null;
  asian_close_bias: string | null;
  prev_day_high: number | null;
  prev_day_low: number | null;
  prev_day_close: number | null;
  prev_week_high: number | null;
  prev_week_low: number | null;
  weekly_open: number | null;
  monthly_open: number | null;
  weekly_open_bias_computed: string | null;
  monthly_open_bias_computed: string | null;
  prev_day_position: string | null;
  asian_swept_prev_low: boolean | null;
  asian_swept_prev_high: boolean | null;
  judas_swept_prev_low: boolean | null;
  judas_swept_prev_high: boolean | null;
  prior_d1_direction: string | null;
  prior_d1_body_pips: number | null;
  asian_clean_trend_matched: boolean;
  weekly_monthly_source: string;
  daily_candle_time_raw: string | null;
  daily_open: number | null;
  daily_high: number | null;
  daily_low: number | null;
  daily_close: number | null;
  daily_close_direction: DailyCloseDirection | null;
  entry_bar_index: number | null;
  entry_price: number | null;
  dist_open: number | null;
  dist_high: number | null;
  dist_low: number | null;
  dol_primary_target: number | null;
  dol_target_distance_pips: number | null;
  dol_already_passed: boolean | null;
  dol_reached: boolean | null;
  bar_index_dol_reached: number | null;
  dol_reached_in_ny_am: boolean | null;
  dol_week_target: number | null;
  dol_week_already_passed: boolean | null;
  dol_week_reached: boolean | null;
  outcome_direction_from_tag: ProductionDirection | null;
  amd_outcome_tag: string | null;
  predicted_judas_inversion_raw: ProductionDirection;
  predicted_auto_direction: ProductionDirection;
  predicted_production: ProductionDirection;
  daily_close_matches_inversion: boolean | null;
  daily_close_matches_auto: boolean | null;
  daily_close_matches_production: boolean | null;
  outcome_matches_production: boolean | null;
  peak_favorable_pips: number | null;
  peak_counter_pips: number | null;
  bar_index_peak_favorable: number | null;
  ny_am_peak: boolean | null;
  net_pips_full: number | null;
  distribution_net_direction: DailyCloseDirection | null;
};
