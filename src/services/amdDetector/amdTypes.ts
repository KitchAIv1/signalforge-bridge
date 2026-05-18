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
  daily_bias_alignment: DailyBiasAlignment;
};

export type AmdTag =
  | 'INSUFFICIENT_DATA'
  | 'AMD_TEXTBOOK'
  | 'AMD_COMPRESSION_BREAKOUT'
  | 'AMD_FAILED'
  | 'AMD_PARTIAL'
  | 'AMD_DELAYED'
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

/** Production return of computeDateFeatures — includes DB column judas_extreme_price. */
export type AmdDateFeatures = DateFeatures & {
  judas_extreme_price: number | null;
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
  daily_bias_alignment: DailyBiasAlignment;
  chart_url: string | null;
  chart_generated_at: string | null;
};
