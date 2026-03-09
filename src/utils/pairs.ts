/**
 * Normalize pair EURUSD → EUR_USD for OANDA; validate instrument.
 */

const KNOWN_PAIRS = new Set([
  'EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CHF', 'AUD_USD', 'NZD_USD', 'EUR_GBP', 'EUR_JPY',
  'GBP_JPY', 'XAU_USD', 'EUR_AUD', 'AUD_JPY', 'USD_CAD', 'EUR_JPY', 'GBP_AUD',
]);

export function toOandaInstrument(pair: string): string {
  const trimmed = (pair ?? '').trim().toUpperCase();
  if (trimmed.length < 6) return trimmed;
  if (trimmed.includes('_')) return trimmed;
  if (trimmed.startsWith('XAU')) return `XAU_${trimmed.slice(3)}`;
  return `${trimmed.slice(0, 3)}_${trimmed.slice(3)}`;
}

export function isValidInstrument(instrument: string): boolean {
  const oanda = toOandaInstrument(instrument);
  return KNOWN_PAIRS.has(oanda) || /^[A-Z]{3}_[A-Z]{3}$/.test(oanda);
}
