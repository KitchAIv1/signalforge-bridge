export type ChecklistStatus = 'pass' | 'warn' | 'fail' | 'neutral' | 'pending';

export type DirectionSide = 'long' | 'short' | 'neutral';

export interface ChecklistRow {
  id: string;
  label: string;
  value: string;
  impliedDirection: DirectionSide | null;
  status: ChecklistStatus;
}

export type AlignmentKind = 'unanimous' | 'split' | 'blocked' | 'neutral' | 'insufficient';

export interface AlignmentSummary {
  kind: AlignmentKind;
  longLabels: string[];
  shortLabels: string[];
  neutralLabels: string[];
}

export type EngineGateState =
  | 'armed'
  | 'blocked'
  | 'paused'
  | 'active'
  | 'done'
  | 'skipped'
  | 'pending';

export interface EngineGateRow {
  engineId: string;
  label: string;
  state: EngineGateState;
  detail: string;
}

export type SessionPhase = 'pending' | 'active' | 'completed';

export type AsianCloseGate = 'AGREE' | 'DISAGREE' | 'NEUTRAL' | 'UNKNOWN';

export interface DistributionVerdict {
  headline: string;
  subline: string;
  tone: 'armed' | 'blocked' | 'neutral' | 'pending';
}

export interface AsianSessionVerdict {
  headline: string;
  subline: string;
  tone: 'complete' | 'skipped' | 'active' | 'pending';
}

export type D1MomentumSignal =
  | 'STRONG_CONTINUATION'
  | 'WEAK_CONTINUATION'
  | 'EXHAUSTION_BUILDING'
  | 'NEUTRAL';

export interface D1ContextConfig {
  d1_prior_direction: 'long' | 'short' | 'equal' | null;
  d1_prior_net_pips: string | null;
  d1_prior_body_pct: string | null;
  d1_prior_close_pos_pct: string | null;
  d1_momentum_signal: D1MomentumSignal | null;
  asian_prior_amd_tag: string | null;
  asian_prior_amd_shifted: boolean | null;
  asian_prior_direction_bias: 'long' | 'short' | 'neutral' | null;
}

export interface AsianSessionDetection {
  id: string;
  trade_date: string;
  condition_fired: 'C' | 'B_SLOW' | 'B' | 'A' | null;
  condition_check_time: string;
  detection_bar: number | null;
  detection_direction: 'long' | 'short' | null;
  detection_net_pips: number | null;
  prior_amd_shifted: boolean;
  prior_amd_tag: string | null;
  size_multiplier: number | null;
  confidence_tier: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  prior_direction_bias: 'long' | 'short' | 'neutral' | null;
  d1_prior_direction?: 'long' | 'short' | 'equal' | null;
  d1_momentum_signal?: D1MomentumSignal | null;
  action:
    | 'SET_LONG'
    | 'SET_SHORT'
    | 'NO_DETECTION'
    | 'SKIPPED_MANUAL_MODE'
    | 'ALREADY_SET'
    | 'D1_FALLBACK'
    | 'D1_FALLBACK_SKIPPED_MANUAL'
    | 'D1_FALLBACK_SKIPPED_TAG'
    | 'D1_FALLBACK_SKIPPED_WEAK_D1'
    | 'D1_FALLBACK_SKIPPED_WINDOW_ACTIVE';
  direction_set: 'long' | 'short' | null;
  valid_until: string | null;
  candle_count: number | null;
  error_message: string | null;
  failure_reason: string | null;
  evaluated_net_pips: number | null;
  evaluated_direction: 'long' | 'short' | null;
  created_at: string;
}

export interface ScalperTradeSummary {
  wins: number;
  losses: number;
  netPips: number;
}

export interface DirectionDecisionSnapshot {
  tradeDate: string;
  asianPhase: SessionPhase;
  distributionPhase: SessionPhase;
  asianChecklist: ChecklistRow[];
  distributionChecklist: ChecklistRow[];
  alignment: AlignmentSummary;
  asianVerdict: AsianSessionVerdict;
  distributionVerdict: DistributionVerdict;
  asianCloseGate: AsianCloseGate;
  gateExplanation: string;
  engineGates: EngineGateRow[];
  scalperSummary: ScalperTradeSummary;
}
