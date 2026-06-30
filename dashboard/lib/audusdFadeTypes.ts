/** AUDUSD Fade dashboard — row type from audusd_fade_trades (migration 051). */

export type FadeTradeDirection = 'long' | 'short';

export type FadeTradeResult = 'win' | 'loss' | 'max_hold' | 'force_close';

export interface AudusdFadeTradeRow {
  id: number;
  trade_date: string;
  pair: string;
  oanda_trade_id: string | null;
  units: number | null;
  direction: FadeTradeDirection;
  entry_price: number;
  tp_price: number;
  sl_price: number;
  exit_price: number | null;
  pnl_pips: number | null;
  pnl_pips_actual: number | null;
  result: FadeTradeResult | null;
  ext_pips: number | null;
  aligned_eur: number | null;
  opened_at: string | null;
  closed_at: string | null;
  close_reason: string | null;
  created_at: string;
}

export interface AudusdFadeStats {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  wins: number;
  losses: number;
  winRateLabel: string;
  netPips: number;
  todayTradeCount: number;
}
