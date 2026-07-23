/**
 * P&L calendar engine filter — client-side only.
 * Does not change fetch/pagination; filters already-loaded closed trades.
 *
 * ALPHAOMEGA is not a separate engine_id — it is omega on Lane B
 * (broker_id = oanda_phase2_demo). "omega" filter = other omega brokers.
 */

import { isOmegaLaneBBroker } from '@/lib/omegaLaneBConstants';
import type { PnlTradeRow } from '@/lib/pnlCalendarTypes';

export const PNL_CALENDAR_FILTER_KEYS = [
  'alphaomega',
  'engine_amd',
  'audusd_fade',
  'omega',
  'engine_rebuild',
  'scalper',
  'omega_inverse',
  'pdl_window',
] as const;

export type PnlCalendarFilterKey = (typeof PNL_CALENDAR_FILTER_KEYS)[number];

export interface PnlCalendarFilterOption {
  key: PnlCalendarFilterKey;
  label: string;
  colorKey: string;
}

/** Default visible set per product request. */
export const PNL_CALENDAR_DEFAULT_FILTERS: readonly PnlCalendarFilterKey[] = [
  'alphaomega',
  'engine_amd',
  'audusd_fade',
];

export const PNL_CALENDAR_FILTER_OPTIONS: readonly PnlCalendarFilterOption[] = [
  { key: 'alphaomega', label: 'ALPHAOMEGA', colorKey: 'omega' },
  { key: 'engine_amd', label: 'AMD', colorKey: 'engine_amd' },
  { key: 'audusd_fade', label: 'AUD Fade', colorKey: 'audusd_fade' },
  { key: 'omega', label: 'Omega', colorKey: 'omega' },
  { key: 'engine_rebuild', label: 'Rebuild', colorKey: 'engine_rebuild' },
  { key: 'scalper', label: 'Scalper', colorKey: 'scalper' },
  { key: 'omega_inverse', label: 'Omega Inverse', colorKey: 'omega_inverse' },
  { key: 'pdl_window', label: 'PDL Window', colorKey: 'pdl_window' },
];

export function isOmegaLaneBTrade(trade: PnlTradeRow): boolean {
  return trade.engine_id === 'omega' && isOmegaLaneBBroker(trade.broker_id);
}

export function tradeMatchesCalendarFilter(
  trade: PnlTradeRow,
  selected: ReadonlySet<PnlCalendarFilterKey>,
): boolean {
  if (selected.size === 0) return false;
  if (trade.engine_id === 'omega') {
    if (isOmegaLaneBTrade(trade)) return selected.has('alphaomega');
    return selected.has('omega');
  }
  if (trade.engine_id === 'engine_amd') return selected.has('engine_amd');
  if (trade.engine_id === 'audusd_fade') return selected.has('audusd_fade');
  if (trade.engine_id === 'engine_rebuild') return selected.has('engine_rebuild');
  if (trade.engine_id === 'scalper') return selected.has('scalper');
  if (trade.engine_id === 'omega_inverse') return selected.has('omega_inverse');
  if (trade.engine_id === 'pdl_window') return selected.has('pdl_window');
  return false;
}

export function filterPnlCalendarTrades(
  trades: readonly PnlTradeRow[],
  selectedKeys: readonly PnlCalendarFilterKey[],
): PnlTradeRow[] {
  const selected = new Set(selectedKeys);
  return trades.filter((trade) => tradeMatchesCalendarFilter(trade, selected));
}

export function toggleCalendarFilterKey(
  current: readonly PnlCalendarFilterKey[],
  key: PnlCalendarFilterKey,
): PnlCalendarFilterKey[] {
  if (current.includes(key)) {
    return current.filter((entry) => entry !== key);
  }
  return [...current, key];
}

export function calendarTradeEngineLabel(trade: PnlTradeRow): string {
  if (isOmegaLaneBTrade(trade)) return 'ALPHAOMEGA';
  if (trade.engine_id === 'omega') return 'Omega';
  if (trade.engine_id === 'engine_amd') return 'AMD';
  if (trade.engine_id === 'audusd_fade') return 'AUD Fade';
  if (trade.engine_id === 'engine_rebuild') return 'Rebuild';
  if (trade.engine_id === 'omega_inverse') return 'Omega Inverse';
  if (trade.engine_id === 'scalper') return 'Scalper';
  if (trade.engine_id === 'pdl_window') return 'PDL Window';
  return trade.engine_id;
}
