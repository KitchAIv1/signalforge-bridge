/**
 * Enrich live AO trades with tape / path / labels (read-only).
 */

import type { AoCandle } from '../alphaOmega2yBacktest/aoTypes.js';
import {
  buildRefuseTapeContext,
  shouldSkipShallowRefuseEntry,
} from '../aoRefuseTapeCf/refuseTapeFeatures.js';
import type { LiveAoTradeRow, LiveFireRow } from '../aoRefuseTapeCf/types.js';
import { walkLiveTradePath } from '../aoRefuseTapeCf/walkLiveTradePath.js';
import {
  isHoldoutTrade,
  labelCausalTape,
  labelCrackQuality,
  labelDayTape,
  labelExitClass,
  labelWeakness,
  tagConfigEra,
  type CrackQuality,
  type DayTapeLabel,
  type ExitClass,
  type WeaknessLabel,
} from './labels.js';
import {
  computeTapeStats,
  rollingBarsBeforeEntry,
  utcDayBars,
  type TapeStats,
} from './tapeStats.js';

export const CAUSAL_WINDOWS = [24, 36, 48] as const;
export const HOLDOUT_FROM_ISO = '2026-07-23T00:00:00.000Z';
export const STRESS_DAYS = [
  '2026-07-14',
  '2026-07-20',
  '2026-07-21',
  '2026-07-22',
] as const;

export interface EnrichedAoTrade {
  trade: LiveAoTradeRow;
  day: string;
  era: string;
  holdout: boolean;
  mfe: number;
  mae: number;
  mfe30: number;
  mae30: number;
  diagnosticLabel: DayTapeLabel;
  diagnosticTape: TapeStats;
  causalByWindow: Record<number, { tape: TapeStats; label: DayTapeLabel }>;
  crack: CrackQuality;
  exitClass: ExitClass;
  weakness: WeaknessLabel;
  policyISkip: boolean;
}

export function enrichLiveAoTrades(
  trades: readonly LiveAoTradeRow[],
  candles: readonly AoCandle[],
  fires: readonly LiveFireRow[],
): EnrichedAoTrade[] {
  const dayTapeCache = new Map<string, TapeStats>();
  const out: EnrichedAoTrade[] = [];
  for (const trade of trades) {
    const day = trade.entryAt.slice(0, 10);
    let diagnosticTape = dayTapeCache.get(day);
    if (!diagnosticTape) {
      diagnosticTape = computeTapeStats(utcDayBars(candles, day));
      dayTapeCache.set(day, diagnosticTape);
    }
    const full = walkLiveTradePath(
      candles,
      trade.direction,
      trade.entryAt,
      trade.fillPrice,
      trade.closedAt,
    );
    const at30 = walkLiveTradePath(
      candles,
      trade.direction,
      trade.entryAt,
      trade.fillPrice,
      new Date(Date.parse(trade.entryAt) + 30 * 60_000).toISOString(),
    );
    const refuse = buildRefuseTapeContext(fires, trade.entryAt);
    const causalByWindow: EnrichedAoTrade['causalByWindow'] = {};
    for (const windowBars of CAUSAL_WINDOWS) {
      const tape = computeTapeStats(
        rollingBarsBeforeEntry(candles, trade.entryAt, windowBars),
      );
      causalByWindow[windowBars] = { tape, label: labelCausalTape(tape) };
    }
    out.push({
      trade,
      day,
      era: tagConfigEra(trade),
      holdout: isHoldoutTrade(trade.entryAt, HOLDOUT_FROM_ISO),
      mfe: full.mfePips,
      mae: full.maePips,
      mfe30: at30.mfePips,
      mae30: at30.maePips,
      diagnosticLabel: labelDayTape(diagnosticTape),
      diagnosticTape,
      causalByWindow,
      crack: labelCrackQuality(trade),
      exitClass: labelExitClass(trade.closeReason),
      weakness: labelWeakness(trade, full.mfePips, full.maePips),
      policyISkip: shouldSkipShallowRefuseEntry(trade, refuse),
    });
  }
  return out;
}
