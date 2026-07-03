/** Load shadow signals; fetch OANDA M5 when outcome_candles missing. */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchM5BarsAfterEntry } from '../../src/services/shadowTrailExit/fetchEntryCandles.js';
import type { ReplaySignalInput, TradeDirection } from '../../src/services/omegaReplay/types.js';
import {
  attachBarTimestamps,
  filterBarsAfterEntry,
  parseOutcomeCandles,
} from './parseOutcomeCandles.js';

const PAGE_SIZE = 200;
const FETCH_DELAY_MS = 120;
const SIGNAL_SELECT =
  'id, fired_at, entry_price, sl_price, direction, outcome_candles';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDirection(raw: unknown): TradeDirection | null {
  const direction = String(raw ?? '').toLowerCase();
  return direction === 'long' || direction === 'short' ? direction : null;
}

export interface LoadSignalsResult {
  signals: ReplaySignalInput[];
  fetchedTotal: number;
  fromCache: number;
  fromOanda: number;
  skippedNoDirection: number;
  skippedNoCandles: number;
  skippedZeroR: number;
}

async function barsForRow(
  row: Record<string, unknown>,
  entryTimeMs: number,
): Promise<ReplaySignalInput['bars'] | null> {
  const parsed = parseOutcomeCandles(row.outcome_candles);
  if (parsed) {
    const timestamped = attachBarTimestamps(parsed, entryTimeMs, row.outcome_candles);
    const cached = filterBarsAfterEntry(timestamped, entryTimeMs);
    if (cached.length >= 5) return cached;
  }

  await sleep(FETCH_DELAY_MS);
  const fetched = await fetchM5BarsAfterEntry('AUD_USD', String(row.fired_at));
  if (fetched.length < 5) return null;
  return fetched.map((bar, index) => ({
    timeMs: bar.time ? Date.parse(bar.time) : entryTimeMs + (index + 1) * 5 * 60 * 1000,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  }));
}

export async function loadShadowSignalsWithFetch(
  supabase: SupabaseClient,
  sinceIso: string,
): Promise<LoadSignalsResult> {
  const signals: ReplaySignalInput[] = [];
  let fetchedTotal = 0;
  let fromCache = 0;
  let fromOanda = 0;
  let skippedNoDirection = 0;
  let skippedNoCandles = 0;
  let skippedZeroR = 0;

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('omega_shadow_signals')
      .select(SIGNAL_SELECT)
      .gte('fired_at', sinceIso)
      .order('fired_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`loadShadowSignalsWithFetch: ${error.message}`);
    if (!data || data.length === 0) break;

    fetchedTotal += data.length;

    for (const raw of data) {
      const row = raw as Record<string, unknown>;
      const direction = normalizeDirection(row.direction);
      if (!direction) {
        skippedNoDirection += 1;
        continue;
      }

      const signalEntry = Number(row.entry_price);
      const signalStopLoss = Number(row.sl_price);
      if (!Number.isFinite(signalEntry) || !Number.isFinite(signalStopLoss)) {
        skippedZeroR += 1;
        continue;
      }
      if (Math.abs(signalEntry - signalStopLoss) <= 0) {
        skippedZeroR += 1;
        continue;
      }

      const firedAtIso = String(row.fired_at);
      const entryTimeMs = Date.parse(firedAtIso);
      const hadCache = parseOutcomeCandles(row.outcome_candles) != null;
      const bars = await barsForRow(row, entryTimeMs);
      if (!bars) {
        skippedNoCandles += 1;
        continue;
      }
      if (hadCache) fromCache += 1;
      else fromOanda += 1;

      signals.push({
        signalId: String(row.id),
        firedAtIso,
        direction,
        signalEntry,
        signalStopLoss,
        bars,
      });
    }

    if (data.length < PAGE_SIZE) break;
  }

  return {
    signals,
    fetchedTotal,
    fromCache,
    fromOanda,
    skippedNoDirection,
    skippedNoCandles,
    skippedZeroR,
  };
}
