import { fetchCompletedCandles } from '../../src/connectors/oanda.js';
import type { DailyLevels, OandaCandle, OandaLevels } from './types.js';

const PAIR = 'AUD_USD';
const OANDA_DELAY_MS = 200;
const LOCKED_ALIGNMENT = 'open-date-plus-one';

export async function fetchDailyCandlesForDate(
  tradeDate: string
): Promise<OandaCandle[]> {
  const { fromISO, toISO } = buildRange(tradeDate, 25, 2);
  return fetchNativeCandles('D', fromISO, toISO);
}

export async function fetchOandaLevelsForDate(
  tradeDate: string,
  cachedDailyCandles?: OandaCandle[]
): Promise<OandaLevels> {
  try {
    const dailyCandles = cachedDailyCandles ?? await fetchDailyCandlesForDate(tradeDate);
    if (!cachedDailyCandles) await delay();
    const weeklyLevels = await fetchWeeklyLevels(tradeDate, dailyCandles);
    await delay();
    const monthlyLevels = await fetchMonthlyLevels(tradeDate, dailyCandles);
    await delay();
    return mergeOandaLevels(
      selectDailyLevels(tradeDate, dailyCandles),
      weeklyLevels,
      monthlyLevels
    );
  } catch (error) {
    console.warn(`[Dol] OANDA fetch failed for ${tradeDate}: ${messageFor(error)}`);
    return emptyOandaLevels();
  }
}

export function printNearbyDailyCandles(
  tradeDate: string,
  candles: OandaCandle[]
): void {
  console.log(`\n[Daily alignment candles near ${tradeDate}] (${LOCKED_ALIGNMENT})`);
  for (const candle of candles.slice(-8)) {
    console.log(
      `  time=${candle.time} open=${candle.mid.o} high=${candle.mid.h} ` +
        `low=${candle.mid.l} close=${candle.mid.c} complete=${candle.complete}`
    );
  }
}

// Locked open-date-plus-one: candle open time + 1 calendar day = trade_date.
// Empirically verified by sanity gate May 19/20/28 — do not change.
export function selectDailyLevels(
  tradeDate: string,
  dailyCandles: OandaCandle[]
): DailyLevels {
  const sortedCandles = [...dailyCandles]
    .filter((candle) => candle.complete)
    .sort(compareByTime);
  const tradeIndex = sortedCandles.findIndex(
    (candle) => dateWithOffset(candle.time, 1) === tradeDate
  );
  const tradeDayCandle = tradeIndex >= 0 ? sortedCandles[tradeIndex] : null;
  const prevDayCandle = tradeIndex > 0 ? sortedCandles[tradeIndex - 1] : null;
  if (!tradeDayCandle) console.warn(`[Dol] no daily candle for ${tradeDate}`);
  return buildDailyLevels(prevDayCandle, tradeDayCandle);
}

function dateWithOffset(timeRaw: string, offsetDays: number): string {
  const mappedMs = Date.parse(timeRaw) + offsetDays * 24 * 3600 * 1000;
  return new Date(mappedMs).toISOString().slice(0, 10);
}

function mergeOandaLevels(
  dailyLevels: DailyLevels,
  weeklyLevels: Pick<OandaLevels, 'prevWeekHigh' | 'prevWeekLow' | 'weeklyOpen' | 'weeklyMonthlySource'>,
  monthlyLevels: Pick<OandaLevels, 'monthlyOpen' | 'weeklyMonthlySource'>
): OandaLevels {
  return {
    ...dailyLevels,
    prevWeekHigh: weeklyLevels.prevWeekHigh,
    prevWeekLow: weeklyLevels.prevWeekLow,
    weeklyOpen: weeklyLevels.weeklyOpen,
    monthlyOpen: monthlyLevels.monthlyOpen,
    weeklyMonthlySource: mergeWeeklyMonthlySource(
      weeklyLevels.weeklyMonthlySource,
      monthlyLevels.weeklyMonthlySource
    ),
  };
}

function mergeWeeklyMonthlySource(weeklySource: string, monthlySource: string): string {
  if (monthlySource.includes('_M_derived')) {
    return weeklySource === 'derived' ? 'derived_M_derived' : `${weeklySource}_M_derived`;
  }
  if (weeklySource === 'derived' || monthlySource === 'derived') return 'derived';
  if (weeklySource === 'native' && monthlySource === 'native') return 'native';
  return weeklySource || monthlySource || 'none';
}

async function fetchWeeklyLevels(
  tradeDate: string,
  fallbackCandles: OandaCandle[]
): Promise<Pick<OandaLevels, 'prevWeekHigh' | 'prevWeekLow' | 'weeklyOpen' | 'weeklyMonthlySource'>> {
  const { fromISO, toISO } = buildRange(tradeDate, 14, 2);
  try {
    const weeklyCandles = await fetchNativeCandles('W', fromISO, toISO);
    return nativeWeeklyLevels(tradeDate, weeklyCandles);
  } catch (error) {
    console.warn(`[Dol] W fetch rejected for ${tradeDate}: ${messageFor(error)}`);
    return derivedWeeklyLevels(tradeDate, fallbackCandles);
  }
}

async function fetchMonthlyLevels(
  tradeDate: string,
  fallbackCandles: OandaCandle[]
): Promise<Pick<OandaLevels, 'monthlyOpen' | 'weeklyMonthlySource'>> {
  const { fromISO, toISO } = buildRange(tradeDate, 40, 2);
  let source = 'native';
  try {
    const monthlyCandles = await fetchNativeCandles('M', fromISO, toISO);
    const nativeOpen = nativeMonthlyOpen(tradeDate, monthlyCandles);
    if (nativeOpen.monthlyOpen != null) return { ...nativeOpen, weeklyMonthlySource: source };
    source = 'native_M_derived';
  } catch (error) {
    console.warn(`[Dol] M fetch rejected for ${tradeDate}: ${messageFor(error)}`);
    source = 'native_M_derived';
  }
  await delay();
  return fetchDerivedMonthlyLevels(tradeDate, fromISO, toISO, fallbackCandles, source);
}

async function fetchNativeCandles(
  granularity: 'D' | 'W' | 'M',
  fromISO: string,
  toISO: string
): Promise<OandaCandle[]> {
  const candles = await fetchCompletedCandles(
    PAIR,
    granularity as Parameters<typeof fetchCompletedCandles>[1],
    fromISO,
    toISO
  );
  return candles as OandaCandle[];
}

function nativeWeeklyLevels(
  tradeDate: string,
  weeklyCandles: OandaCandle[]
): Pick<OandaLevels, 'prevWeekHigh' | 'prevWeekLow' | 'weeklyOpen' | 'weeklyMonthlySource'> {
  const sortedCandles = [...weeklyCandles].sort(compareByTime);
  const currentIndex = latestIndexOnOrBefore(sortedCandles, tradeDate);
  const currentWeekBar = currentIndex >= 0 ? sortedCandles[currentIndex] : null;
  const prevWeekBar = currentIndex > 0 ? sortedCandles[currentIndex - 1] : null;
  return {
    prevWeekHigh: parsePrice(prevWeekBar?.mid.h),
    prevWeekLow: parsePrice(prevWeekBar?.mid.l),
    weeklyOpen: parsePrice(currentWeekBar?.mid.o),
    weeklyMonthlySource: 'native',
  };
}

function nativeMonthlyOpen(
  tradeDate: string,
  monthlyCandles: OandaCandle[]
): Pick<OandaLevels, 'monthlyOpen'> {
  const sortedCandles = [...monthlyCandles].sort(compareByTime);
  const index = latestIndexOnOrBefore(sortedCandles, tradeDate);
  const monthBar = index >= 0 ? sortedCandles[index] : null;
  return { monthlyOpen: parsePrice(monthBar?.mid.o) };
}

function derivedWeeklyLevels(
  tradeDate: string,
  dailyCandles: OandaCandle[]
): Pick<OandaLevels, 'prevWeekHigh' | 'prevWeekLow' | 'weeklyOpen' | 'weeklyMonthlySource'> {
  const sortedCandles = [...dailyCandles].sort(compareByTime);
  const weekStartMs = startOfUtcWeekMs(tradeDate);
  const currentWeek = sortedCandles.filter((candle) => Date.parse(candle.time) >= weekStartMs);
  const previousWeek = sortedCandles.filter((candle) => Date.parse(candle.time) < weekStartMs);
  return {
    weeklyOpen: parsePrice(currentWeek[0]?.mid.o),
    prevWeekHigh: maxPrice(previousWeek.slice(-5), 'h'),
    prevWeekLow: minPrice(previousWeek.slice(-5), 'l'),
    weeklyMonthlySource: 'derived',
  };
}

async function fetchDerivedMonthlyLevels(
  tradeDate: string,
  fromISO: string,
  toISO: string,
  fallbackCandles: OandaCandle[],
  source: string
): Promise<Pick<OandaLevels, 'monthlyOpen' | 'weeklyMonthlySource'>> {
  try {
    const dailyCandles = await fetchNativeCandles('D', fromISO, toISO);
    return derivedMonthlyLevels(tradeDate, dailyCandles, source);
  } catch (error) {
    console.warn(`[Dol] monthly D fallback failed for ${tradeDate}: ${messageFor(error)}`);
    return derivedMonthlyLevels(tradeDate, fallbackCandles, source);
  }
}

function derivedMonthlyLevels(
  tradeDate: string,
  dailyCandles: OandaCandle[],
  source: string
): Pick<OandaLevels, 'monthlyOpen' | 'weeklyMonthlySource'> {
  const monthPrefix = tradeDate.slice(0, 7);
  const monthBar = [...dailyCandles]
    .sort(compareByTime)
    .find((candle) => candle.time.slice(0, 10).startsWith(monthPrefix));
  return {
    monthlyOpen: parsePrice(monthBar?.mid.o),
    weeklyMonthlySource: source,
  };
}

function buildDailyLevels(
  prevDayCandle: OandaCandle | null,
  tradeDayCandle: OandaCandle | null
): DailyLevels {
  return {
    prevDayHigh: parsePrice(prevDayCandle?.mid.h),
    prevDayLow: parsePrice(prevDayCandle?.mid.l),
    prevDayClose: parsePrice(prevDayCandle?.mid.c),
    dailyOpen: parsePrice(tradeDayCandle?.mid.o),
    dailyClose: parsePrice(tradeDayCandle?.mid.c),
    dailyHigh: parsePrice(tradeDayCandle?.mid.h),
    dailyLow: parsePrice(tradeDayCandle?.mid.l),
    dailyCandleTimeRaw: tradeDayCandle?.time ?? null,
  };
}

function latestIndexOnOrBefore(candles: OandaCandle[], tradeDate: string): number {
  const candidates = candles
    .map((candle, index) => ({ index, datePart: candle.time.slice(0, 10) }))
    .filter((entry) => entry.datePart <= tradeDate);
  return candidates.at(-1)?.index ?? -1;
}

function buildRange(
  tradeDate: string,
  daysBefore: number,
  daysAfter: number
): { fromISO: string; toISO: string } {
  const tradeDateMs = Date.parse(`${tradeDate}T00:00:00.000Z`);
  const fromDate = new Date(tradeDateMs - daysBefore * 24 * 3600 * 1000);
  const toDate = new Date(tradeDateMs + daysAfter * 24 * 3600 * 1000);
  const cappedToDate = toDate.getTime() > Date.now() ? new Date() : toDate;
  return {
    fromISO: `${fromDate.toISOString().slice(0, 10)}T00:00:00.000000000Z`,
    toISO: cappedToDate.toISOString(),
  };
}

function emptyOandaLevels(): OandaLevels {
  return {
    prevDayHigh: null,
    prevDayLow: null,
    prevDayClose: null,
    dailyOpen: null,
    dailyClose: null,
    dailyHigh: null,
    dailyLow: null,
    dailyCandleTimeRaw: null,
    prevWeekHigh: null,
    prevWeekLow: null,
    weeklyOpen: null,
    monthlyOpen: null,
    weeklyMonthlySource: 'none',
  };
}

function maxPrice(candles: OandaCandle[], field: 'h' | 'l'): number | null {
  const prices = candles.map((candle) => parsePrice(candle.mid[field])).filter(isNumber);
  return prices.length ? Math.max(...prices) : null;
}

function minPrice(candles: OandaCandle[], field: 'h' | 'l'): number | null {
  const prices = candles.map((candle) => parsePrice(candle.mid[field])).filter(isNumber);
  return prices.length ? Math.min(...prices) : null;
}

function startOfUtcWeekMs(tradeDate: string): number {
  const date = new Date(`${tradeDate}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  return date.getTime() - daysSinceMonday * 24 * 3600 * 1000;
}

function parsePrice(value: string | undefined): number | null {
  if (value == null) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isNumber(price: number | null): price is number {
  return price != null && Number.isFinite(price);
}

function compareByTime(leftCandle: OandaCandle, rightCandle: OandaCandle): number {
  return Date.parse(leftCandle.time) - Date.parse(rightCandle.time);
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, OANDA_DELAY_MS));
}
