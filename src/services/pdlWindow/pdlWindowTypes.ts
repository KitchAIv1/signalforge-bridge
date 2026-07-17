export type PdlWindowTradeResult =
  | 'win'
  | 'loss'
  | 'breakeven'
  | 'time_exit'
  | 'force_close';

export type PdlWindowConditionsMet = {
  pdl_breach: boolean;
  london_down: boolean;
  h11_up: boolean;
};

export type PdlWindowTrade = {
  id: number;
  trade_date: string;
  pair: string;
  broker_id: string;
  oanda_trade_id: string | null;
  units: number | null;
  direction: 'long';
  entry_price: number;
  sl_price: number;
  exit_price: number | null;
  pnl_pips: number | null;
  pnl_dollars: number | null;
  pnl_r: number | null;
  result: PdlWindowTradeResult | null;
  close_reason: string | null;
  conditions_met: PdlWindowConditionsMet | null;
  block_reason: string | null;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
};

export type PdlWindowTradeInsert = {
  trade_date: string;
  pair?: string;
  broker_id: string;
  oanda_trade_id: string | null;
  units: number;
  direction: 'long';
  entry_price: number;
  sl_price: number;
  conditions_met: PdlWindowConditionsMet | null;
  opened_at: string;
};
