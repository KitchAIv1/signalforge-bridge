/** Build paper outcomes from already-loaded trade rows (no API / no OANDA). */

import { isSpeedfloorShadowRow } from './isSpeedfloorShadowRow';
import { mapStoredSpeedfloorOutcome } from './mapStoredSpeedfloorOutcome';
import type { SpeedfloorPaperOutcome } from './paperSimTypes';
import type { BridgeTradeLogRow } from '@/lib/types';

export function hydrateStoredSpeedfloorOutcomes(
  tradeRows: readonly BridgeTradeLogRow[],
): Record<string, SpeedfloorPaperOutcome> {
  const outcomes: Record<string, SpeedfloorPaperOutcome> = {};
  for (const row of tradeRows) {
    if (!isSpeedfloorShadowRow(row)) continue;
    const stored = mapStoredSpeedfloorOutcome(row);
    if (stored) outcomes[row.id] = stored;
  }
  return outcomes;
}

/** SPEEDFLOOR rows that still need sim (not yet persisted closed). */
export function openSpeedfloorTradeIds(
  tradeRows: readonly BridgeTradeLogRow[],
): string[] {
  const ids: string[] = [];
  for (const row of tradeRows) {
    if (!isSpeedfloorShadowRow(row)) continue;
    if (mapStoredSpeedfloorOutcome(row)) continue;
    ids.push(row.id);
  }
  return [...new Set(ids)];
}
