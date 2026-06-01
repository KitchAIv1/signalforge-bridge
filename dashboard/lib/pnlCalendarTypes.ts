export type PnlTradeRow = {
  id: string;
  created_at: string;
  engine_id: string;
  direction: string;
  result: string;
  pnl_r: number | null;
  pnl_dollars: number | null;
  close_reason: string | null;
  bar1_strength: string | null;
  oanda_trade_id: string | null;
  pair: string | null;
};

export type DaySummary = {
  date: string;
  trades: PnlTradeRow[];
  netR: number;
  netDollars: number;
  hasNullDollars: boolean;
  wins: number;
  losses: number;
  breakevens: number;
  omegaNetR: number;
  rebuildNetR: number;
  scalperNetR: number;
  winRate: number;
  longNetR: number;
  shortNetR: number;
  longCount: number;
  shortCount: number;
  tradeCount: number;
};

export type EquityPoint = {
  label: string;
  cumR: number;
  omegaR: number;
  rebuildR: number;
};
