export type PeakFadeTradeRow = {
  id: number;
  trade_date: string;
  pair: string;
  broker_id: string | null;
  broker_trade_id: string | null;
  units: number | null;
  direction: 'long' | 'short';
  entry_price: number;
  tp_price: number;
  ref_day_key: string | null;
  exit_price: number | null;
  pnl_pips: number | null;
  pnl_pips_actual: number | null;
  result: string | null;
  opened_at: string | null;
  closed_at: string | null;
  close_reason: string | null;
  created_at: string;
};

export type PeakFadeStats = {
  openCount: number;
  todayCount: number;
  todayNetPips: number;
  closedCount: number;
  winCount: number;
};
