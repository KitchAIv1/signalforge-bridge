/**
 * Batch SPEEDFLOOR paper outcomes — read-only; never writes bridge_trade_log.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { PAPER_MAX_HOLD_HOURS } from './paperSimConstants';
import { firesAfterEntry, loadPaperFiresInRange } from './loadPaperFires';
import { loadPaperM5Candles } from './loadPaperCandles';
import {
  dollarsFromPaperPips,
  sizeSpeedfloorPaperUnits,
} from './sizeSpeedfloorPaperUnits';
import {
  paperPipsFromWalk,
  walkSpeedfloorPaperExit,
} from './walkSpeedfloorPaperExit';
import type {
  SpeedfloorPaperInput,
  SpeedfloorPaperOutcome,
} from './paperSimTypes';

const GIVEBACK_KEY = 'alpha_omega_giveback_trail_enabled';

export async function readGivebackEnabled(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', GIVEBACK_KEY)
    .maybeSingle();
  return data?.config_value === true || data?.config_value === 'true';
}

function insufficient(
  trade: SpeedfloorPaperInput,
  detail: string,
): SpeedfloorPaperOutcome {
  return {
    tradeId: trade.tradeId,
    signalId: trade.signalId,
    status: 'insufficient_data',
    paperPips: null,
    paperDollars: null,
    paperUnits: null,
    exitTrigger: null,
    exitAt: null,
    holdMinutes: null,
    entryPrice: trade.entryPrice,
    detail,
  };
}

function windowBounds(trades: readonly SpeedfloorPaperInput[]): {
  fromIso: string;
  toIso: string;
} {
  let minMs = Infinity;
  let maxMs = 0;
  for (const trade of trades) {
    const entryMs = Date.parse(trade.entryAt);
    minMs = Math.min(minMs, entryMs);
    maxMs = Math.max(maxMs, entryMs);
  }
  const padMs = PAPER_MAX_HOLD_HOURS * 3_600_000 + 30 * 60_000;
  return {
    fromIso: new Date(minMs - 5 * 60_000).toISOString(),
    toIso: new Date(Math.max(maxMs + padMs, Date.now())).toISOString(),
  };
}

export function simulateOneSpeedfloorPaper(
  trade: SpeedfloorPaperInput,
  candles: Awaited<ReturnType<typeof loadPaperM5Candles>>,
  fires: Awaited<ReturnType<typeof loadPaperFiresInRange>>,
  givebackEnabled: boolean,
): SpeedfloorPaperOutcome {
  if (!(trade.entryPrice > 0)) {
    return insufficient(trade, 'Missing entry_price on blocked row');
  }
  const walk = walkSpeedfloorPaperExit({
    direction: trade.direction,
    entryAt: trade.entryAt,
    entryPrice: trade.entryPrice,
    candles,
    firesAfterEntry: firesAfterEntry(fires, trade.entryAt, trade.signalId),
    givebackEnabled,
  });
  const paperUnits = sizeSpeedfloorPaperUnits(
    trade.equity ?? 0,
    trade.entryPrice,
    trade.stopLoss,
    new Date(trade.entryAt),
  );
  const paperPips = paperPipsFromWalk(trade.direction, trade.entryPrice, walk);
  const holdMinutes = walk.open
    ? null
    : Math.round(((Date.parse(walk.exitAt) - Date.parse(trade.entryAt)) / 60_000) * 10) /
      10;

  if (walk.open) {
    return {
      tradeId: trade.tradeId,
      signalId: trade.signalId,
      status: 'paper_open',
      paperPips: null,
      paperDollars: null,
      paperUnits,
      exitTrigger: 'open',
      exitAt: null,
      holdMinutes: null,
      entryPrice: trade.entryPrice,
      detail: 'Still open on paper — no exit yet',
    };
  }

  const paperDollars =
    paperPips != null && paperUnits != null
      ? dollarsFromPaperPips(paperPips, paperUnits)
      : null;

  return {
    tradeId: trade.tradeId,
    signalId: trade.signalId,
    status: 'paper_closed',
    paperPips,
    paperDollars,
    paperUnits,
    exitTrigger: walk.trigger,
    exitAt: walk.exitAt,
    holdMinutes,
    entryPrice: trade.entryPrice,
    detail: null,
  };
}

export async function simulateSpeedfloorPaperBatch(
  supabase: SupabaseClient,
  trades: readonly SpeedfloorPaperInput[],
): Promise<{
  outcomes: Record<string, SpeedfloorPaperOutcome>;
  givebackEnabled: boolean;
}> {
  if (trades.length === 0) {
    return { outcomes: {}, givebackEnabled: false };
  }
  const givebackEnabled = await readGivebackEnabled(supabase);
  const { fromIso, toIso } = windowBounds(trades);
  const [candles, fires] = await Promise.all([
    loadPaperM5Candles(fromIso, toIso),
    loadPaperFiresInRange(supabase, fromIso, toIso),
  ]);

  const outcomes: Record<string, SpeedfloorPaperOutcome> = {};
  for (const trade of trades) {
    outcomes[trade.tradeId] = simulateOneSpeedfloorPaper(
      trade,
      candles,
      fires,
      givebackEnabled,
    );
  }
  return { outcomes, givebackEnabled };
}
