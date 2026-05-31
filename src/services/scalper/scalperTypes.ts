/** Scalper engine — shared types and configuration loader. */

export type ScalperDirection = 'long' | 'short';

export type ScalperTradeResult =
  | 'win'
  | 'loss'
  | 'force_flat'
  | 'force_flat_failed'
  | 'timeout_16h';

export type ScalperStopReason =
  | 'sl'
  | 'max_ratchets'
  | 'hard_close'
  | 'no_trigger'
  | 'no_agree'
  | 'amd_not_ready';

export interface ScalperDayState {
  id: number;
  trade_date: string;
  pair: string;
  direction: ScalperDirection | null;
  reference_price: number | null;
  trigger_level: number | null;
  ratchet_count: number;
  day_stopped: boolean;
  stop_reason: ScalperStopReason | null;
  net_pips_day: number;
  created_at: string;
  updated_at: string;
}

export interface ScalperTrade {
  id: number;
  trade_date: string;
  pair: string;
  oanda_trade_id: string | null;
  direction: ScalperDirection;
  entry_price: number;
  tp_price: number;
  sl_price: number;
  exit_price: number | null;
  pnl_pips: number | null;
  pnl_pips_actual: number | null;
  result: ScalperTradeResult | null;
  ratchet_index: number | null;
  opened_at: string | null;
  closed_at: string | null;
  close_reason: string | null;
  created_at: string;
}

export interface ScalperConfig {
  /** Pips from reference price to trigger level. Env: SCALPER_PULLBACK_PIPS (default 5) */
  pullbackPips: number;
  /** Take profit in pips. Env: SCALPER_TP_PIPS (default 10) */
  tpPips: number;
  /** Stop loss in pips. Env: SCALPER_SL_PIPS (default 10) */
  slPips: number;
  /** Max concurrent ratcheted trades per day. Env: SCALPER_MAX_RATCHETS (default 3) */
  maxRatchets: number;
  /** Risk fraction of account balance per trade. Env: SCALPER_RISK_PCT (default 0.01) */
  riskPct: number;
  /** OANDA instrument. Env: SCALPER_PAIR (default AUD_USD) */
  pair: string;
}

export function loadScalperConfig(): ScalperConfig {
  return {
    pullbackPips: Number(process.env.SCALPER_PULLBACK_PIPS ?? '5'),
    tpPips: Number(process.env.SCALPER_TP_PIPS ?? '10'),
    slPips: Number(process.env.SCALPER_SL_PIPS ?? '10'),
    maxRatchets: Number(process.env.SCALPER_MAX_RATCHETS ?? '3'),
    riskPct: Number(process.env.SCALPER_RISK_PCT ?? '0.01'),
    pair: process.env.SCALPER_PAIR ?? 'AUD_USD',
  };
}

/** Convert pips to price for AUD_USD (5-decimal pair, 1 pip = 0.0001). */
export function pipsToPrice(pips: number): number {
  return pips * 0.0001;
}

/** Signed pips from entry to exit. Positive = profit for long, negative = loss. */
export function signedPips(
  entry: number,
  exit: number,
  direction: ScalperDirection,
): number {
  const raw =
    direction === 'long' ? (exit - entry) * 10000 : (entry - exit) * 10000;
  return Math.round(raw * 10) / 10;
}

export function todayUtcString(): string {
  return new Date().toISOString().slice(0, 10);
}
