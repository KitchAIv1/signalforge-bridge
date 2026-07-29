export type PdlWindowDirection = 'long' | 'short';

export type PdlWindowTradeRow = {
  id: number;
  trade_date: string;
  pair: string;
  broker_id: string;
  oanda_trade_id: string | null;
  units: number | null;
  direction: PdlWindowDirection;
  entry_price: number;
  sl_price: number;
  exit_price: number | null;
  pnl_pips: number | null;
  pnl_dollars: number | null;
  pnl_r: number | null;
  result: string | null;
  close_reason: string | null;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
};
