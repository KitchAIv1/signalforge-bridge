/**
 * Map bridge instruments (OANDA-style AUD_USD) to broker-specific symbols.
 */

const KNOWN_MT5_BASE: Record<string, string> = {
  AUD_USD: 'AUDUSD',
  EUR_USD: 'EURUSD',
  GBP_USD: 'GBPUSD',
  USD_JPY: 'USDJPY',
  USD_CHF: 'USDCHF',
  NZD_USD: 'NZDUSD',
  USD_CAD: 'USDCAD',
  XAU_USD: 'XAUUSD',
};

export function bridgeInstrumentToMt5Base(instrument: string): string {
  const trimmed = instrument.trim().toUpperCase();
  if (KNOWN_MT5_BASE[trimmed]) return KNOWN_MT5_BASE[trimmed];
  if (trimmed.includes('_')) return trimmed.replace('_', '');
  return trimmed;
}

export function bridgeInstrumentToMt5(instrument: string, suffix: string): string {
  const base = bridgeInstrumentToMt5Base(instrument);
  const cleanSuffix = suffix.startsWith('-') || suffix.startsWith('.')
    ? suffix
    : `-${suffix}`;
  if (base.includes('-') || base.includes('.')) return base;
  return `${base}${cleanSuffix}`;
}

export function mt5SymbolToBridgeInstrument(mt5Symbol: string): string {
  const stripped = mt5Symbol.replace(/[-.](STP|ECN|VIP|STD|PRO).*$/i, '');
  if (stripped.length === 6) {
    return `${stripped.slice(0, 3)}_${stripped.slice(3)}`;
  }
  return mt5Symbol;
}
