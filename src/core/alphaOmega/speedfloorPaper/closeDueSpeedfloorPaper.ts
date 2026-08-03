import type { SupabaseClient } from '@supabase/supabase-js';
import { persistSpeedfloorPaperClose } from './speedfloorPaperClose.js';
import type { SpeedfloorPaperTrigger } from './speedfloorPaperCloseReasons.js';
import type { OpenSpeedfloorPaper } from './speedfloorPaperLoad.js';
import {
  walkSpeedfloorPaperExit,
  type SpeedfloorPaperCandle,
  type SpeedfloorPaperFire,
} from './speedfloorPaperWalk.js';

/** Walk one paper; persist close if exit triggered. Returns rows updated. */
export async function closeDueSpeedfloorPaper(input: {
  supabase: SupabaseClient;
  paper: OpenSpeedfloorPaper;
  candles: readonly SpeedfloorPaperCandle[];
  fires: readonly SpeedfloorPaperFire[];
  givebackEnabled: boolean;
  nowMs: number;
}): Promise<number> {
  const firesAfter = input.fires.filter(
    (fire) =>
      fire.signalId !== input.paper.signalId &&
      Date.parse(fire.firedAt) > Date.parse(input.paper.entryAt),
  );
  const walk = walkSpeedfloorPaperExit({
    direction: input.paper.direction,
    entryAt: input.paper.entryAt,
    entryPrice: input.paper.entryPrice,
    candles: input.candles,
    firesAfterEntry: firesAfter,
    givebackEnabled: input.givebackEnabled,
    nowMs: input.nowMs,
  });
  if (walk.open || walk.trigger === 'open') return 0;
  return persistSpeedfloorPaperClose(input.supabase, {
    signalId: input.paper.signalId,
    direction: input.paper.direction,
    entryPrice: input.paper.entryPrice,
    entryAt: input.paper.entryAt,
    stopLoss: input.paper.stopLoss,
    equity: input.paper.equity,
    trigger: walk.trigger as SpeedfloorPaperTrigger,
    exitAt: walk.exitAt,
    exitPrice: walk.exitPrice,
  });
}
