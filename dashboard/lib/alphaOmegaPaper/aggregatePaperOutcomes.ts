/** Aggregate SPEEDFLOOR paper outcomes for scoreboard (dedupe by signal_id). */

import type { SpeedfloorPaperOutcome } from './paperSimTypes';

export interface SpeedfloorPaperScore {
  closedCount: number;
  paperNetPips: number;
  paperNetDollars: number;
  openCount: number;
}

export function aggregatePaperOutcomes(
  outcomes: Record<string, SpeedfloorPaperOutcome>,
): SpeedfloorPaperScore {
  const bySignal = new Map<string, SpeedfloorPaperOutcome>();
  for (const outcome of Object.values(outcomes)) {
    const key = outcome.signalId || outcome.tradeId;
    if (!bySignal.has(key)) bySignal.set(key, outcome);
  }

  let closedCount = 0;
  let paperNetPips = 0;
  let paperNetDollars = 0;
  let openCount = 0;
  for (const outcome of bySignal.values()) {
    if (outcome.status === 'paper_open') {
      openCount += 1;
      continue;
    }
    if (outcome.status !== 'paper_closed') continue;
    closedCount += 1;
    paperNetPips += outcome.paperPips ?? 0;
    paperNetDollars += outcome.paperDollars ?? 0;
  }
  return {
    closedCount,
    paperNetPips: Math.round(paperNetPips * 10) / 10,
    paperNetDollars: Math.round(paperNetDollars * 100) / 100,
    openCount,
  };
}
