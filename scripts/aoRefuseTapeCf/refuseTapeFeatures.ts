/** AO-native refuse-tape features from the live BLOCKED fire stream. */

import type { LiveAoTradeRow, LiveFireRow, RefuseTapeContext } from './types.js';

const PRE_WINDOW_MS = 3 * 60 * 60 * 1000;
const NO_CRACK = 'ALPHAOMEGA_NO_QUALIFYING_CRACK';

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildRefuseTapeContext(
  fires: readonly LiveFireRow[],
  entryAt: string,
): RefuseTapeContext {
  const entryMs = Date.parse(entryAt);
  const windowStart = entryMs - PRE_WINDOW_MS;
  const pre = fires.filter((fire) => {
    const fireMs = Date.parse(fire.createdAt);
    return fireMs >= windowStart && fireMs < entryMs;
  });
  const blocked = pre.filter((fire) => fire.decision === 'BLOCKED');
  const noCrack = blocked.filter((fire) => fire.blockReason === NO_CRACK);
  const blockedConfs = blocked
    .map((fire) => fire.confluence)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const preBlockRate = pre.length ? blocked.length / pre.length : 0;
  const refuseTape = pre.length >= 3 && preBlockRate >= 0.75 && noCrack.length >= 3;

  return {
    preFireCount: pre.length,
    preBlockedCount: blocked.length,
    preNoCrackCount: noCrack.length,
    preBlockRate: Math.round(preBlockRate * 1000) / 1000,
    avgBlockedConf: average(blockedConfs),
    refuseTape,
  };
}

export function isShallowCrack(trade: LiveAoTradeRow): boolean {
  return trade.foundingLength === 7 && trade.foundingSpeedMin <= 40;
}

export function isWeakCrackVsBlocked(
  trade: LiveAoTradeRow,
  context: RefuseTapeContext,
): boolean {
  if (trade.confluence == null) return trade.foundingLength === 7;
  if (context.avgBlockedConf == null) return trade.confluence <= 18;
  return trade.confluence <= Math.min(18, context.avgBlockedConf);
}

export function shouldSkipShallowRefuseEntry(
  trade: LiveAoTradeRow,
  context: RefuseTapeContext,
): boolean {
  return isShallowCrack(trade) && context.refuseTape && isWeakCrackVsBlocked(trade, context);
}

export interface ShallowSessionInput {
  takenTrades: readonly LiveAoTradeRow[];
  loserTrades: readonly LiveAoTradeRow[];
  lastLoserMfePips: number | null;
}

/** Conditional brake qualifier — avoids killing Jul-10/13 recovery days. */
export function sessionIsShallowForBrake(input: ShallowSessionInput): boolean {
  const { takenTrades, loserTrades, lastLoserMfePips } = input;
  if (!takenTrades.length || loserTrades.length < 2) return false;
  const avgLen =
    takenTrades.reduce((sum, trade) => sum + trade.foundingLength, 0) / takenTrades.length;
  const len7Losers = loserTrades.filter((trade) => trade.foundingLength === 7).length;
  if (avgLen <= 8) return true;
  if (len7Losers >= 2) return true;
  if (len7Losers >= 1 && lastLoserMfePips != null && lastLoserMfePips < 1.5) return true;
  return false;
}
