/** Types for AO refuse-tape live counterfactual research. */

export interface LiveFireRow {
  createdAt: string;
  signalReceivedAt: string;
  direction: string;
  decision: string;
  blockReason: string | null;
  confluence: number | null;
  signalId: string;
}

export interface LiveAoTradeRow {
  id: string;
  createdAt: string;
  entryAt: string;
  closedAt: string;
  direction: string;
  laneAdvisory: string;
  confluence: number | null;
  fillPrice: number;
  stopLoss: number | null;
  units: number;
  pnlPips: number;
  pnlDollars: number;
  closeReason: string | null;
  foundingLength: number;
  foundingSpeedMin: number;
  pureSizing: boolean;
}

export interface TradePathMetrics {
  mfePips: number;
  maePips: number;
  abortPips: number | null;
  abortAt: string | null;
  abortTriggered: boolean;
}

export interface RefuseTapeContext {
  preFireCount: number;
  preBlockedCount: number;
  preNoCrackCount: number;
  preBlockRate: number;
  avgBlockedConf: number | null;
  refuseTape: boolean;
}

export interface PolicyTradeResult {
  tradeId: string;
  day: string;
  taken: boolean;
  skipReason: string | null;
  cfPips: number;
  cfDollars: number;
  sizeMult: number;
  abortUsed: boolean;
  actualPips: number;
  actualDollars: number;
}

export interface PolicyDayScore {
  day: string;
  actualPips: number;
  actualDollars: number;
  cfPips: number;
  cfDollars: number;
  tradesTaken: number;
  tradesSkipped: number;
}

export interface PolicyScorecard {
  label: string;
  totalActualPips: number;
  totalActualDollars: number;
  totalCfPips: number;
  totalCfDollars: number;
  deltaPips: number;
  deltaDollars: number;
  byDay: PolicyDayScore[];
  promoteOk: boolean;
  promoteNotes: string[];
}
