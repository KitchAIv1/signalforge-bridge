export const PDL_WINDOW_ENGINE_ID = 'pdl_window';
export const PDL_WINDOW_PAIR = 'AUD_USD';
export const PDL_WINDOW_TABLE = 'pdl_window_trades';
export const PDL_WINDOW_HARD_SL_PIPS = 20;
export const PDL_WINDOW_EXIT_HOUR_UTC = 15;
export const PDL_WINDOW_DEFAULT_RISK_PCT = 0.02;
export const PDL_WINDOW_OANDA_BROKER_ID = 'oanda_practice';

export function isPdlWindowEnabled(): boolean {
  return process.env.PDL_WINDOW_ENABLED === 'true';
}

export function pdlWindowRiskPct(): number {
  const raw = process.env.PDL_WINDOW_RISK_PCT;
  if (raw == null || raw === '') return PDL_WINDOW_DEFAULT_RISK_PCT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 0.05) {
    return PDL_WINDOW_DEFAULT_RISK_PCT;
  }
  return parsed;
}
