/** Parse omega_shadow_signals outcome_candles into timestamped M5 bars. */

import type { TimestampedBar } from '../../src/services/omegaReplay/types.js';

interface RawOutcomeBar {
  time?: string;
  o?: number;
  h?: number;
  l?: number;
  c?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

function pickNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseFlatBar(row: RawOutcomeBar): Omit<TimestampedBar, 'timeMs'> | null {
  const high = pickNum(row.high ?? row.h);
  const low = pickNum(row.low ?? row.l);
  const close = pickNum(row.close ?? row.c);
  const open = pickNum(row.open ?? row.o) ?? close;
  if (high == null || low == null || close == null) return null;
  return { open, high, low, close };
}

function parseNestedMidBar(row: Record<string, unknown>): Omit<TimestampedBar, 'timeMs'> | null {
  const midRaw = row.mid;
  if (midRaw == null || typeof midRaw !== 'object') return null;
  return parseFlatBar(midRaw as RawOutcomeBar);
}

export function parseOutcomeCandles(raw: unknown): Omit<TimestampedBar, 'timeMs'>[] | null {
  if (!Array.isArray(raw)) return null;
  const bars: Omit<TimestampedBar, 'timeMs'>[] = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const parsed = parseFlatBar(row as RawOutcomeBar) ?? parseNestedMidBar(row);
    if (parsed) bars.push(parsed);
  }
  return bars.length > 0 ? bars : null;
}

const BAR_MS = 5 * 60 * 1000;

function readBarTimeMs(row: RawOutcomeBar, fallbackMs: number): number {
  if (row.time) {
    const parsed = Date.parse(row.time);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallbackMs;
}

export function attachBarTimestamps(
  bars: readonly Omit<TimestampedBar, 'timeMs'>[],
  entryTimeMs: number,
  rawCandles: unknown,
): TimestampedBar[] {
  const rawList = Array.isArray(rawCandles) ? rawCandles : [];
  return bars.map((bar, index) => {
    const rawRow = rawList[index] as RawOutcomeBar | undefined;
    const fallbackMs = entryTimeMs + (index + 1) * BAR_MS;
    const timeMs = rawRow ? readBarTimeMs(rawRow, fallbackMs) : fallbackMs;
    return { ...bar, timeMs };
  });
}

export function filterBarsAfterEntry(
  bars: readonly TimestampedBar[],
  entryTimeMs: number,
): TimestampedBar[] {
  return bars.filter((bar) => bar.timeMs > entryTimeMs);
}
