/** Peak Fade engine — frozen ids and thresholds. */

export const PEAK_FADE_ENGINE_ID = 'peak_fade';
export const PEAK_FADE_ENABLED_ENV = 'PEAK_FADE_ENABLED';
export const PEAK_FADE_OANDA_ACCOUNT_ENV = 'PEAK_FADE_OANDA_ACCOUNT_ID';
export const PEAK_FADE_VT_BROKER_ID = 'vtmarkets_peak_fade_demo';
export const PEAK_FADE_MT5_ACCOUNT_ENV = 'METAAPI_PEAK_FADE_ACCOUNT_ID';
/** Distinct from omega 88001, fade 88002, pdl 88003, AO 88004, AMD 88005. */
export const PEAK_FADE_MT5_MAGIC = 88006;

export const PEAK_FADE_PAIR = 'AUD_USD';
export const PEAK_FADE_PIP_SIZE = 0.0001;

export const PEAK_FADE_NEAR_EXTREME_PIPS = 10;
export const PEAK_FADE_TREND_BARS = 6;
export const PEAK_FADE_MIN_TREND_PROGRESS_PIPS = 3;
export const PEAK_FADE_TARGET_PIPS = 9;
/** Sizing reference only — not a hard stop on the ticket. */
export const PEAK_FADE_RISK_REF_PIPS = 20;
export const PEAK_FADE_DEFAULT_RISK_PCT = 1;
export const PEAK_FADE_DEFAULT_WEIGHT = 0.1;

/** News: no new entries in [event−2h, event+1h]. */
export const PEAK_FADE_NEWS_PRE_HOURS = 2;
export const PEAK_FADE_NEWS_POST_HOURS = 1;

export const PEAK_FADE_TRADES_TABLE = 'peak_fade_trades';

export function isPeakFadeEnvEnabled(): boolean {
  return process.env[PEAK_FADE_ENABLED_ENV] === 'true';
}
