/** Backfill optimized shadow sim for rows missing opt columns. */

import { fetchM5BarsAfterEntry } from './fetchEntryCandles.js';
import { attachOptimizedShadowSim } from './attachOptimizedShadowSim.js';
import type { ShadowTrailRow } from './types.js';

export async function backfillOptimizedShadowRows(
  rows: ShadowTrailRow[],
): Promise<ShadowTrailRow[]> {
  const updated: ShadowTrailRow[] = [];
  for (const row of rows) {
    if (row.shadow_opt_pips_net != null || !row.filter_passed || row.shadow_exit_bars == null) {
      updated.push(row);
      continue;
    }
    const bars = await fetchM5BarsAfterEntry('AUD_USD', row.fired_at);
    if (bars.length < 2) {
      updated.push(row);
      continue;
    }
    updated.push(attachOptimizedShadowSim(row, bars));
  }
  return updated;
}
