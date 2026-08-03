/**
 * Close due SPEEDFLOOR papers (shared by monitor + backfill).
 * Never places broker orders; never touches ao_shadow_paper / EXECUTED.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isAlphaOmegaGivebackTrailEnabled } from '../alphaOmegaGivebackTrail.js';
import { closeDueSpeedfloorPaper } from './closeDueSpeedfloorPaper.js';
import {
  loadOmegaFiresForPaper,
  loadOpenSpeedfloorPapers,
  loadSpeedfloorM5Chunked,
  paperWindowBounds,
  type OpenSpeedfloorPaper,
} from './speedfloorPaperLoad.js';

function preferOandaPaper(papers: OpenSpeedfloorPaper[]): OpenSpeedfloorPaper[] {
  const bySignal = new Map<string, OpenSpeedfloorPaper>();
  for (const paper of papers) {
    if (!paper.signalId) continue;
    const prev = bySignal.get(paper.signalId);
    if (!prev || paper.brokerId === 'oanda_phase2_demo') {
      bySignal.set(paper.signalId, paper);
    }
  }
  return [...bySignal.values()];
}

export interface ProcessSpeedfloorPaperResult {
  openCount: number;
  uniqueSignals: number;
  closedSignals: number;
  closedRows: number;
}

export async function processOpenSpeedfloorPapers(
  supabase: SupabaseClient,
  options?: { limit?: number; nowMs?: number },
): Promise<ProcessSpeedfloorPaperResult> {
  const openRows = await loadOpenSpeedfloorPapers(supabase, {
    limit: options?.limit ?? 200,
  });
  if (openRows.length === 0) {
    return { openCount: 0, uniqueSignals: 0, closedSignals: 0, closedRows: 0 };
  }

  const unique = preferOandaPaper(openRows);
  const { fromMs, toMs } = paperWindowBounds(unique);
  const [candles, fires] = await Promise.all([
    loadSpeedfloorM5Chunked(fromMs, toMs),
    loadOmegaFiresForPaper(
      supabase,
      new Date(fromMs).toISOString(),
      new Date(toMs).toISOString(),
    ),
  ]);
  const givebackEnabled = await isAlphaOmegaGivebackTrailEnabled(supabase);
  const nowMs = options?.nowMs ?? Date.now();

  let closedSignals = 0;
  let closedRows = 0;
  for (const paper of unique) {
    const n = await closeDueSpeedfloorPaper({
      supabase,
      paper,
      candles,
      fires,
      givebackEnabled,
      nowMs,
    });
    if (n > 0) {
      closedSignals += 1;
      closedRows += n;
    }
  }

  return {
    openCount: openRows.length,
    uniqueSignals: unique.length,
    closedSignals,
    closedRows,
  };
}
