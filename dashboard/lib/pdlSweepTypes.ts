// Explicit cast required for conditions_met jsonb — do not assume shape at fetch time.
export interface ConditionsMet {
  pdl_breach: boolean;
  london_down: boolean;
  h11_up: boolean;
}

export type PdlSweepSignalRow = {
  id: number;
  trade_date: string;
  pair: string;
  prior_day_low: number | null;
  price_at_1155: number | null;
  pdl_sweep_depth_pips: number | null;
  london_net_pips: number | null;
  london_direction: string | null;
  h11_net_pips: number | null;
  h11_direction: string | null;
  signal_fired: boolean;
  signal_direction: string | null;
  conditions_met: Record<string, unknown> | null;
  amd_outcome_tag: string | null;
  decision_auto_direction: string | null;
  auto_direction_confidence: string | null;
  outcome_h12_net_pips: number | null;
  outcome_h12_direction: string | null;
  outcome_evaluated_at: string | null;
  evaluated_at: string;
  created_at: string;
};
