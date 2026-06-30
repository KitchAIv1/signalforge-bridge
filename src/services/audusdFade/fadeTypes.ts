/** AUDUSD Fade engine — shared types and configuration loader. */

export type FadeDirection = 'long' | 'short';

export type FadeTradeResult = 'win' | 'loss' | 'max_hold' | 'force_close';

export interface FadeTrade {
  id: number;
  trade_date: string;
  pair: string;
  oanda_trade_id: string | null;
  units: number | null;
  direction: FadeDirection;
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

export interface FadeConfig {
  /** AUDUSD instrument to fade. Env: AUDUSD_FADE_PAIR (default AUD_USD) */
  pair: string;
  /** EURUSD gate instrument. Env: AUDUSD_FADE_GATE_PAIR (default EUR_USD) */
  gatePair: string;
  /** SMA lookback in M5 bars. Env: AUDUSD_FADE_SMA_PERIOD (default 50) */
  smaPeriod: number;
  /** Extension trigger in pips: |close - SMA50| >= thresh. Env: AUDUSD_FADE_THRESH (default 30) */
  threshPips: number;
  /** Take profit toward the mean, in pips. Env: AUDUSD_FADE_TARGET (default 10) */
  targetPips: number;
  /** Stop loss on further extension, in pips. Env: AUDUSD_FADE_STOP (default 15) */
  stopPips: number;
  /** EURUSD momentum window in M5 bars (4h). Env: AUDUSD_FADE_GATE_WIN (default 48) */
  gateWindowBars: number;
  /** Keep trade only if aligned EUR momentum >= cutoff. Env: AUDUSD_FADE_GATE_CUTOFF (default -50) */
  gateCutoffPips: number;
  /** Max fade trades per UTC day. Env: AUDUSD_FADE_MAX_TRADES_DAY (default 2) */
  maxTradesDay: number;
  /** Risk percent of equity per trade. Env: AUDUSD_FADE_RISK_PCT (default 2) */
  riskPct: number;
  /** Max hold before force-close, in hours. Env: AUDUSD_FADE_MAX_HOLD_HOURS (default 4) */
  maxHoldHours: number;
  /**
   * Dedicated OANDA account for the fade so positions never net against other
   * engines (omega/amd/etc.) sharing the main account. Env:
   * AUDUSD_FADE_OANDA_ACCOUNT_ID. When unset, falls back to the global
   * OANDA_ACCOUNT_ID (legacy behaviour — subject to cross-engine netting).
   */
  oandaAccountId: string | undefined;
}

export function loadFadeConfig(): FadeConfig {
  return {
    pair: process.env.AUDUSD_FADE_PAIR ?? 'AUD_USD',
    gatePair: process.env.AUDUSD_FADE_GATE_PAIR ?? 'EUR_USD',
    smaPeriod: Number(process.env.AUDUSD_FADE_SMA_PERIOD ?? '50'),
    threshPips: Number(process.env.AUDUSD_FADE_THRESH ?? '30'),
    targetPips: Number(process.env.AUDUSD_FADE_TARGET ?? '10'),
    stopPips: Number(process.env.AUDUSD_FADE_STOP ?? '15'),
    gateWindowBars: Number(process.env.AUDUSD_FADE_GATE_WIN ?? '48'),
    gateCutoffPips: Number(process.env.AUDUSD_FADE_GATE_CUTOFF ?? '-50'),
    maxTradesDay: Number(process.env.AUDUSD_FADE_MAX_TRADES_DAY ?? '2'),
    riskPct: Number(process.env.AUDUSD_FADE_RISK_PCT ?? '2'),
    maxHoldHours: Number(process.env.AUDUSD_FADE_MAX_HOLD_HOURS ?? '4'),
    oandaAccountId: process.env.AUDUSD_FADE_OANDA_ACCOUNT_ID || undefined,
  };
}

/** Convert pips to price for a 5-decimal USD-quote pair (1 pip = 0.0001). */
export function pipsToPrice(pips: number): number {
  return pips * 0.0001;
}

/** Price difference expressed in signed pips. */
export function priceToPips(priceDiff: number): number {
  return Math.round((priceDiff / 0.0001) * 10) / 10;
}

/** Signed pips from entry to exit. Positive = profit. */
export function signedPips(
  entry: number,
  exit: number,
  direction: FadeDirection,
): number {
  const raw =
    direction === 'long' ? (exit - entry) * 10000 : (entry - exit) * 10000;
  return Math.round(raw * 10) / 10;
}

export function todayUtcString(): string {
  return new Date().toISOString().slice(0, 10);
}
