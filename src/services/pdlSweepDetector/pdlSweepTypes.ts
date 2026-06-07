export type HourDirection = 'UP' | 'DOWN' | 'FLAT';

export type StoredM5Candle = {
  time: string;
  o: string;
  h: string;
  l: string;
  c: string;
};

export type ChartOhlcBar = {
  time: string;
  o: string;
  h: string;
  l: string;
  c: string;
};

export type PdlConditionsMet = {
  pdl_breach: boolean;
  london_down: boolean;
  h11_up: boolean;
};

export type PdlSweepComputed = {
  prior_day_low: number | null;
  price_at_1155: number | null;
  pdl_sweep_depth_pips: number | null;
  london_net_pips: number | null;
  london_direction: HourDirection | null;
  h11_net_pips: number | null;
  h11_direction: HourDirection | null;
  signal_fired: boolean;
  signal_direction: 'long' | null;
  conditions_met: PdlConditionsMet;
  amd_outcome_tag: string | null;
  decision_auto_direction: string | null;
  auto_direction_confidence: string | null;
};
