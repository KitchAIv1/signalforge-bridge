/**
 * Asian session price-ratchet simulation (00:00–08:00 UTC).
 * reference_price = 00:00 UTC bar close
 * trigger scan = 00:05–07:55 UTC
 * hard close = 08:00 UTC bar close
 */

import {
  findEntryBarIndex,
  sortedCandles,
  type M5Candle,
  type ScalpDirection,
} from '../scalperBacktest/simulateScalp.js';

export type AsianRatchetOutcome = 'win' | 'loss' | 'force_flat' | 'timeout_0800';
export type AsianRatchetStoppedBy = 'no_trigger' | 'sl' | 'scan_end' | 'hard_close_0800';

export type ClosedAsianRatchetTrade = {
  openedBarIndex: number;
  closedBarIndex: number;
  entryPrice: number;
  outcome: AsianRatchetOutcome;
  netPips: number;
};

export type OpenAsianRatchetTrade = {
  entryPrice: number;
  tpPrice: number;
  slPrice: number;
  openedBarIndex: number;
};

export type AsianRatchetDayResult = {
  tradeDate: string;
  direction: ScalpDirection;
  closedTrades: ClosedAsianRatchetTrade[];
  maxConcurrent: number;
  wins: number;
  losses: number;
  forceClosedFlat: number;
  timeouts0800: number;
  netPips: number;
  stoppedBy: AsianRatchetStoppedBy;
};

function toPrice(pips: number): number {
  return pips / 10000;
}

function signedPips(entry: number, exit: number, direction: ScalpDirection): number {
  const raw = direction === 'long' ? (exit - entry) * 10000 : (entry - exit) * 10000;
  return Math.round(raw * 10) / 10;
}

function isAfter0755TriggerUtc(bar: M5Candle): boolean {
  const stamp = new Date(bar.time);
  const hour = stamp.getUTCHours();
  const minute = stamp.getUTCMinutes();
  return hour > 7 || (hour === 7 && minute > 55);
}

function buildTriggerLevel(
  referencePrice: number,
  direction: ScalpDirection,
  pullbackPips: number,
): number {
  return direction === 'long'
    ? referencePrice - toPrice(pullbackPips)
    : referencePrice + toPrice(pullbackPips);
}

function buildOpenTrade(
  entryPrice: number,
  direction: ScalpDirection,
  tpPips: number,
  slPips: number,
  openedBarIndex: number,
): OpenAsianRatchetTrade {
  return {
    entryPrice,
    tpPrice:
      direction === 'long' ? entryPrice + toPrice(tpPips) : entryPrice - toPrice(tpPips),
    slPrice:
      direction === 'long' ? entryPrice - toPrice(slPips) : entryPrice + toPrice(slPips),
    openedBarIndex,
  };
}

function triggerAtLevel(bar: M5Candle, direction: ScalpDirection, triggerLevel: number): boolean {
  if (direction === 'long') return parseFloat(bar.l) <= triggerLevel;
  return parseFloat(bar.h) >= triggerLevel;
}

function slHitOnBar(trade: OpenAsianRatchetTrade, bar: M5Candle, direction: ScalpDirection): boolean {
  if (direction === 'long') return parseFloat(bar.l) <= trade.slPrice;
  return parseFloat(bar.h) >= trade.slPrice;
}

function tpHitOnBar(trade: OpenAsianRatchetTrade, bar: M5Candle, direction: ScalpDirection): boolean {
  if (direction === 'long') return parseFloat(bar.h) >= trade.tpPrice;
  return parseFloat(bar.l) <= trade.tpPrice;
}

function step1SlCheck(
  openTrades: OpenAsianRatchetTrade[],
  barIndex: number,
  bar: M5Candle,
  direction: ScalpDirection,
  slPips: number,
): { closed: ClosedAsianRatchetTrade[]; dayStopped: boolean } {
  for (let tradeIdx = 0; tradeIdx < openTrades.length; tradeIdx += 1) {
    const trade = openTrades[tradeIdx]!;
    if (!slHitOnBar(trade, bar, direction)) continue;
    const closed: ClosedAsianRatchetTrade[] = [{
      openedBarIndex: trade.openedBarIndex,
      closedBarIndex: barIndex,
      entryPrice: trade.entryPrice,
      outcome: 'loss',
      netPips: -slPips,
    }];
    for (let otherIdx = 0; otherIdx < openTrades.length; otherIdx += 1) {
      if (otherIdx === tradeIdx) continue;
      closed.push({
        openedBarIndex: openTrades[otherIdx]!.openedBarIndex,
        closedBarIndex: barIndex,
        entryPrice: openTrades[otherIdx]!.entryPrice,
        outcome: 'force_flat',
        netPips: 0,
      });
    }
    return { closed, dayStopped: true };
  }
  return { closed: [], dayStopped: false };
}

function step2TpClose(
  openTrades: OpenAsianRatchetTrade[],
  bar: M5Candle,
  barIndex: number,
  direction: ScalpDirection,
  tpPips: number,
): { stillOpen: OpenAsianRatchetTrade[]; closed: ClosedAsianRatchetTrade[] } {
  const stillOpen: OpenAsianRatchetTrade[] = [];
  const closed: ClosedAsianRatchetTrade[] = [];
  for (const trade of openTrades) {
    if (tpHitOnBar(trade, bar, direction)) {
      closed.push({
        openedBarIndex: trade.openedBarIndex,
        closedBarIndex: barIndex,
        entryPrice: trade.entryPrice,
        outcome: 'win',
        netPips: tpPips,
      });
    } else {
      stillOpen.push(trade);
    }
  }
  return { stillOpen, closed };
}

function step3PriceRatchet(
  openTrades: OpenAsianRatchetTrade[],
  bar: M5Candle,
  direction: ScalpDirection,
  referencePrice: number,
  ratchetCount: number,
  maxRatchets: number,
): { referencePrice: number; ratchetCount: number; ratcheted: boolean } {
  const touched = openTrades.filter((trade) => tpHitOnBar(trade, bar, direction));
  if (!touched.length || ratchetCount >= maxRatchets) {
    return { referencePrice, ratchetCount, ratcheted: false };
  }
  const tpPrices = touched.map((trade) => trade.tpPrice);
  const nextReference =
    direction === 'long' ? Math.max(...tpPrices) : Math.min(...tpPrices);
  if (nextReference === referencePrice) {
    return { referencePrice, ratchetCount, ratcheted: false };
  }
  return { referencePrice: nextReference, ratchetCount: ratchetCount + 1, ratcheted: true };
}

function emptyDayResult(tradeDate: string, direction: ScalpDirection): AsianRatchetDayResult {
  return {
    tradeDate,
    direction,
    closedTrades: [],
    maxConcurrent: 0,
    wins: 0,
    losses: 0,
    forceClosedFlat: 0,
    timeouts0800: 0,
    netPips: 0,
    stoppedBy: 'no_trigger',
  };
}

export function simulateAsianPriceRatchetDay(
  tradeDate: string,
  candles: M5Candle[],
  direction: ScalpDirection,
  pullbackPips: number,
  tpPips: number,
  slPips: number,
  maxRatchets: number,
): AsianRatchetDayResult {
  const sorted = sortedCandles(candles);
  const refIdx = findEntryBarIndex(sorted, 0, 0);
  if (refIdx < 0) return emptyDayResult(tradeDate, direction);

  const initialReference = parseFloat(sorted[refIdx]!.c);
  if (!Number.isFinite(initialReference)) return emptyDayResult(tradeDate, direction);

  const scanStartIdx = findEntryBarIndex(sorted, 0, 5);
  if (scanStartIdx < 0) return emptyDayResult(tradeDate, direction);

  const hardCloseIdx = findEntryBarIndex(sorted, 8, 0);
  const lastBarIdx = hardCloseIdx >= 0 ? hardCloseIdx : sorted.length - 1;

  let referencePrice = initialReference;
  let triggerLevel = buildTriggerLevel(referencePrice, direction, pullbackPips);
  let openTrades: OpenAsianRatchetTrade[] = [];
  let closedTrades: ClosedAsianRatchetTrade[] = [];
  let dayStopped = false;
  let ratchetCount = 0;
  let maxConcurrent = 0;

  for (let barIndex = scanStartIdx; barIndex <= lastBarIdx; barIndex += 1) {
    const bar = sorted[barIndex]!;

    if (!dayStopped && openTrades.length > 0) {
      const slStep = step1SlCheck(openTrades, barIndex, bar, direction, slPips);
      if (slStep.dayStopped) {
        closedTrades.push(...slStep.closed);
        openTrades = [];
        dayStopped = true;
      }
    }

    if (!dayStopped && openTrades.length > 0) {
      const ratchetStep = step3PriceRatchet(
        openTrades,
        bar,
        direction,
        referencePrice,
        ratchetCount,
        maxRatchets,
      );
      if (ratchetStep.ratcheted) {
        referencePrice = ratchetStep.referencePrice;
        triggerLevel = buildTriggerLevel(referencePrice, direction, pullbackPips);
        ratchetCount = ratchetStep.ratchetCount;
      }
      const tpStep = step2TpClose(openTrades, bar, barIndex, direction, tpPips);
      openTrades = tpStep.stillOpen;
      closedTrades.push(...tpStep.closed);
    }

    if (!dayStopped && !isAfter0755TriggerUtc(bar)) {
      const canOpenFirst = openTrades.length === 0;
      const canOpenAdditional =
        ratchetCount >= 1 &&
        ratchetCount < maxRatchets &&
        openTrades.length > 0 &&
        openTrades.length < maxRatchets;
      const openedOnBar = openTrades.some((trade) => trade.openedBarIndex === barIndex);
      if ((canOpenFirst || canOpenAdditional) && triggerAtLevel(bar, direction, triggerLevel) && !openedOnBar) {
        openTrades.push(buildOpenTrade(triggerLevel, direction, tpPips, slPips, barIndex));
      }
    }

    maxConcurrent = Math.max(maxConcurrent, openTrades.length);
  }

  if (openTrades.length > 0) {
    const bar = sorted[lastBarIdx]!;
    const closePrice = parseFloat(bar.c);
    closedTrades.push(
      ...openTrades.map((trade) => ({
        openedBarIndex: trade.openedBarIndex,
        closedBarIndex: lastBarIdx,
        entryPrice: trade.entryPrice,
        outcome: 'timeout_0800' as const,
        netPips: signedPips(trade.entryPrice, closePrice, direction),
      })),
    );
    openTrades = [];
  }

  const wins = closedTrades.filter((trade) => trade.outcome === 'win').length;
  const losses = closedTrades.filter((trade) => trade.outcome === 'loss').length;
  const forceClosedFlat = closedTrades.filter((trade) => trade.outcome === 'force_flat').length;
  const timeouts0800 = closedTrades.filter((trade) => trade.outcome === 'timeout_0800').length;
  const netPips = Math.round(closedTrades.reduce((sum, trade) => sum + trade.netPips, 0) * 10) / 10;

  let stoppedBy: AsianRatchetStoppedBy = 'scan_end';
  if (!closedTrades.length) stoppedBy = 'no_trigger';
  else if (losses > 0) stoppedBy = 'sl';
  else if (timeouts0800 > 0) stoppedBy = 'hard_close_0800';

  return {
    tradeDate,
    direction,
    closedTrades,
    maxConcurrent,
    wins,
    losses,
    forceClosedFlat,
    timeouts0800,
    netPips,
    stoppedBy,
  };
}
