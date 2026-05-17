export type JudasDirection = 'UP' | 'DOWN' | 'FLAT';

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
  chart_url: string | null;
  chart_generated_at: string | null;
};
