/**
 * Per-account MT5 symbol suffix helpers (dashboard bind/probe UI).
 * Keep in sync with src/connectors/broker/mt5SymbolSuffix.ts
 */

const KNOWN_SUFFIX_TOKENS = new Set(['STD', 'VIP', 'ECN', 'PRO']);
const INFER_PRIORITY = ['-STD', '-VIP', '-ECN', '-PRO'] as const;

export function normalizeMt5SymbolSuffix(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let token = raw.trim().toUpperCase();
  if (!token) return null;

  token = token.replace(/^AUDUSD/, '');
  token = token.replace(/^[-_.]+/, '');
  if (!token) return null;

  const first = token.split(/[-_.\s]/)[0] ?? '';
  if (!first) return null;
  if (!KNOWN_SUFFIX_TOKENS.has(first) && !/^[A-Z0-9]{2,8}$/.test(first)) return null;
  return `-${first}`;
}

export function inferMt5SymbolSuffixFromSymbols(symbols: string[]): string | null {
  const audusdNames = symbols
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => symbol.startsWith('AUDUSD'));

  for (const preferred of INFER_PRIORITY) {
    const base = `AUDUSD${preferred}`;
    const underscore = `AUDUSD_${preferred.slice(1)}`;
    if (audusdNames.includes(base) || audusdNames.includes(underscore)) {
      return preferred;
    }
  }

  for (const symbol of audusdNames) {
    const match = symbol.match(/^AUDUSD[-_.]([A-Z0-9]{2,8})$/);
    if (match?.[1] && KNOWN_SUFFIX_TOKENS.has(match[1])) {
      return `-${match[1]}`;
    }
  }

  return null;
}

export const MT5_SYMBOL_SUFFIX_OPTIONS = [
  { value: '-STD', label: 'Standard STP (AUDUSD-STD)' },
  { value: '-VIP', label: 'VIP (AUDUSD-VIP)' },
  { value: '-ECN', label: 'ECN (AUDUSD-ECN)' },
] as const;
