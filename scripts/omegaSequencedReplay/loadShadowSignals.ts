/** Load omega_shadow_signals for sequenced replay. */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReplaySignalInput, TradeDirection } from '../../src/services/omegaReplay/types.js';
import { attachBarTimestamps, filterBarsAfterEntry, parseOutcomeCandles } from './parseOutcomeCandles.js';

const PAGE_SIZE = 200;
const SIGNAL_SELECT =
  'id, fired_at, entry_price, sl_price, direction, outcome_candles';

function normalizeDirection(raw: unknown): TradeDirection | null {
  const direction = String(raw ?? '').toLowerCase();
  if (direction === 'long' || direction === 'short') return direction;
  return null;
}

export interface LoadSignalsResult {
  signals: ReplaySignalInput[];
  fetchedTotal: number;
  skippedNoDirection: number;
  skippedNoCandles: number;
  skippedZeroR: number;
}

export async function loadShadowSignals(
  supabase: SupabaseClient,
  sinceIso: string,
): Promise<LoadSignalsResult> {
  const signals: ReplaySignalInput[] = [];
  let fetchedTotal = 0;
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

    if (error) throw new Error(`loadShadowSignals: ${error.message}`);
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

      const parsedBars = parseOutcomeCandles(row.outcome_candles);
      if (!parsedBars) {
        skippedNoCandles += 1;
        continue;
      }

      const firedAtIso = String(row.fired_at);
      const entryTimeMs = Date.parse(firedAtIso);
      const timestampedBars = attachBarTimestamps(parsedBars, entryTimeMs, row.outcome_candles);
      const bars = filterBarsAfterEntry(timestampedBars, entryTimeMs);
      if (bars.length < 5) {
        skippedNoCandles += 1;
        continue;
      }

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
    skippedNoDirection,
    skippedNoCandles,
    skippedZeroR,
  };
}
