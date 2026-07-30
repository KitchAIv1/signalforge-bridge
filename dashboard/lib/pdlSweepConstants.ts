export const PDL_SWEEP_PAIR = 'AUD_USD';
export const FORWARD_GATE_DAYS = 30;
export const HISTORICAL_FIRED_DAYS = 12;
export const PDL_SWEEP_REFRESH_MS = 60_000;
export const PDL_WINDOW_VT_SPREAD_PIPS = 1.5;
export const PDL_WINDOW_HARD_SL_PIPS = 5;
/** Live detect+entry cron (UTC). Retries briefly if OANDA M5 lag. */
export const PDL_DETECTION_CRON_UTC = '12:01';

export const PDL_POLL_START_HOUR_UTC = 11;
export const PDL_POLL_START_MINUTE_UTC = 30;
/** Poll through live hold end (13:00 UTC hard flatten). */
export const PDL_POLL_END_HOUR_UTC = 13;
export const PDL_POLL_END_MINUTE_UTC = 5;
