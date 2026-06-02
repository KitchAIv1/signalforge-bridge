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
