export type JudasDirection = 'UP' | 'DOWN' | 'FLAT';

/** Last-five-D1-bar vote snapshot (aligned with historical AMD backtest). */
export type Layer4D1Bias = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | null;

/** Judas vs D1 macro alignment (null when insufficient signal). */
export type DailyBiasAlignment = 'ALIGNED' | 'CONFLICTED' | 'RANGING' | null;

/** Persisted alongside amd_state / echoed on trade log for audit. */
export type AmdDailyBiasSnapshot = {
  layer4_d1_bias: Layer4D1Bias;
  layer4_bullish_count: number | null;
  layer4_bearish_count: number | null;
  // 7-candle window (AMD_SHIFTED only — threshold ≥4)
  layer4_bullish_count_7: number | null;
  layer4_bearish_count_7: number | null;
  layer4_d1_bias_7: Layer4D1Bias;
  daily_bias_alignment: DailyBiasAlignment;
};

export type AmdTag =
  | 'INSUFFICIENT_DATA'
  | 'AMD_TEXTBOOK'
  | 'AMD_COMPRESSION_BREAKOUT'
  | 'AMD_FAILED'
  | 'AMD_SHIFTED'
  | 'AMD_NONE';

export type DateFeatures = {
  asian_range_pips: number | null;
  asian_net_pips: number | null;
  asian_is_flat: boolean;
  judas_direction: JudasDirection | null;
  judas_pips: number | null;
  reversal_confirmed: boolean | null;
  compression_breakout: boolean;
  delayed_distribution: boolean;
  amd_tag: AmdTag;
};

export type AsianCloseBiasSignal = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null;

/** Production return of computeDateFeatures — includes DB column judas_extreme_price. */
export type AmdDateFeatures = DateFeatures & {
  judas_extreme_price: number | null;
  asian_close_position_pct?: number | null;
  asian_close_bias_signal?: AsianCloseBiasSignal;
  accumulation_quality_score?: number | null;
};

export type AmdStateRow = {
  trade_date: string;
  evaluated_at: string;
  pair: string;
  asian_range_pips: number | null;
  asian_net_pips: number | null;
  asian_is_flat: boolean;
  judas_direction: JudasDirection | null;
  judas_pips: number | null;
  judas_extreme_price: number | null;
  reversal_confirmed: boolean | null;
  compression_breakout: boolean;
  delayed_distribution: boolean;
  amd_tag: AmdTag;
  layer4_d1_bias: Layer4D1Bias;
  layer4_bullish_count: number | null;
  layer4_bearish_count: number | null;
  layer4_bullish_count_7: number | null;
  layer4_bearish_count_7: number | null;
  layer4_d1_bias_7: Layer4D1Bias;
  daily_bias_alignment: DailyBiasAlignment;
  auto_direction: string | null;
  auto_direction_confidence: string | null;
  auto_direction_reason: string | null;
  amd_size_multiplier: number | null;
  chart_url: string | null;
  chart_generated_at: string | null;
  // M5 signal fields (written at 10:31 UTC)
  m5_first_3_net_pips?: number | null;
  m5_vs_judas_direction?: string | null;
  m5_first_candle_direction?: string | null;
  m5_evaluated_at?: string | null;
  // Outcome fields (written at 16:30 UTC)
  amd_outcome_tag?: string | null;
  reversal_confirmed_outcome?: boolean | null;
  compression_breakout_outcome?: boolean | null;
  outcome_evaluated_at?: string | null;
  // Asian dominance signal fields
  // (written at 10:31 UTC for AMD_SHIFTED)
  judas_to_range_ratio?: number | null;
  asian_drift_ratio?: number | null;
  asian_dominance_ratio?: number | null;
  market_structure_type?: string | null;
  asian_net_direction?: string | null;
  // Asian close bias (written at 10:31 UTC)
  asian_close_position_pct?: number | null;
  asian_close_bias_signal?: AsianCloseBiasSignal;
  // Immutable first-detection snapshot (written once, never overwritten)
  decision_auto_direction?: string | null;
  decision_evaluated_at?: string | null;
};

/** Auto-direction output from AMD + D1 conviction analysis. */
export type AutoDirection = 'long' | 'short' | 'neutral';

/** Confidence level for auto-direction decision. */
export type AutoDirectionConfidence = 'high' | 'medium' | 'low' | 'very_low';

/** Full auto-direction snapshot written to amd_state. */
export type AmdAutoDirectionSnapshot = {
  auto_direction: AutoDirection;
  auto_direction_confidence: AutoDirectionConfidence;
  auto_direction_reason: string;
  amd_size_multiplier: number;
  // Asian dominance signal (SHIFTED only)
  judas_to_range_ratio?: number | null;
  asian_drift_ratio?: number | null;
  asian_dominance_ratio?: number | null;
  market_structure_type?: string | null;
  asian_net_direction?: string | null;
};

export type AmdM5Signal = {
  m5_first_3_net_pips: number | null;
  m5_vs_judas_direction:
    'WITH_JUDAS' | 'AGAINST_JUDAS' | 'NEUTRAL' | null;
  m5_first_candle_direction:
    'bullish' | 'bearish' | 'doji' | null;
  m5_evaluated_at: string | null;
};

export type AmdOutcomeResult = {
  amd_outcome_tag: string | null;
  reversal_confirmed_outcome: boolean | null;
  compression_breakout_outcome: boolean | null;
  outcome_evaluated_at: string | null;
};
