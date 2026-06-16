/** Asian session turning-point metrics from M5 candles (00:00–08:00 UTC). */

interface AsianM5Bar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface AsianTurningPointMetrics {
  turnTime: string;
  preTurnSpeed: number;
  postTurnSpeed: number;
  postTurnPips: number;
  postTurnMinutes: number;
  retracementPct: number;
}

const SESSION_START = 'T00:00:00';
const SESSION_END = 'T08:00:00';

function parseBar(raw: Record<string, unknown>): AsianM5Bar | null {
  const time = typeof raw.time === 'string' ? raw.time : '';
  if (!time) return null;
  if (typeof raw.mid === 'object' && raw.mid != null) {
    const mid = raw.mid as Record<string, unknown>;
    const open = parseFloat(String(mid.o ?? ''));
    const high = parseFloat(String(mid.h ?? ''));
    const low = parseFloat(String(mid.l ?? ''));
    const close = parseFloat(String(mid.c ?? ''));
    if ([open, high, low, close].some(Number.isNaN)) return null;
    return { time, open, high, low, close };
  }
  const open = parseFloat(String(raw.o ?? raw.open ?? ''));
  const high = parseFloat(String(raw.h ?? raw.high ?? ''));
  const low = parseFloat(String(raw.l ?? raw.low ?? ''));
  const close = parseFloat(String(raw.c ?? raw.close ?? ''));
  if ([open, high, low, close].some(Number.isNaN)) return null;
  return { time, open, high, low, close };
}

function toPips(delta: number): number {
  return Math.round(delta * 10000 * 10) / 10;
}

function minutesBetween(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
}

function filterAsianWindow(bars: AsianM5Bar[], tradeDate: string): AsianM5Bar[] {
  const start = `${tradeDate}${SESSION_START}`;
  const end = `${tradeDate}${SESSION_END}`;
  return bars
    .filter((bar) => bar.time >= start && bar.time < end)
    .sort((left, right) => left.time.localeCompare(right.time));
}

interface SwingCandidate {
  turnTime: string;
  prePips: number;
  postPips: number;
  totalSwingPips: number;
}

function buildLowTurn(open: number, close: number, low: number, lowTime: string): SwingCandidate {
  return {
    turnTime: lowTime,
    prePips: toPips(open - low),
    postPips: toPips(close - low),
    totalSwingPips: Math.abs(toPips(open - low)) + Math.abs(toPips(close - low)),
  };
}

function buildHighTurn(open: number, close: number, high: number, highTime: string): SwingCandidate {
  const prePips = toPips(high - open);
  const postPips = toPips(high - close);
  return {
    turnTime: highTime,
    prePips,
    postPips,
    totalSwingPips: Math.abs(prePips) + Math.abs(postPips),
  };
}

function findLocalExtrema(bars: AsianM5Bar[]): Array<{ time: string; price: number; kind: 'low' | 'high' }> {
  const extrema: Array<{ time: string; price: number; kind: 'low' | 'high' }> = [];
  for (let index = 1; index < bars.length - 1; index += 1) {
    const prev = bars[index - 1];
    const current = bars[index];
    const next = bars[index + 1];
    if (current.low <= prev.low && current.low <= next.low) {
      extrema.push({ time: current.time, price: current.low, kind: 'low' });
    }
    if (current.high >= prev.high && current.high >= next.high) {
      extrema.push({ time: current.time, price: current.high, kind: 'high' });
    }
  }
  return extrema;
}

function swingFromExtremum(
  open: number,
  close: number,
  point: { time: string; price: number; kind: 'low' | 'high' },
): SwingCandidate {
  if (point.kind === 'low') return buildLowTurn(open, close, point.price, point.time);
  return buildHighTurn(open, close, point.price, point.time);
}

function collectSwingCandidates(
  bars: AsianM5Bar[],
  open: number,
  close: number,
  sessionLow: number,
  sessionLowTime: string,
  sessionHigh: number,
  sessionHighTime: string,
): SwingCandidate[] {
  const candidates = [
    buildLowTurn(open, close, sessionLow, sessionLowTime),
    buildHighTurn(open, close, sessionHigh, sessionHighTime),
  ];
  for (const point of findLocalExtrema(bars)) {
    candidates.push(swingFromExtremum(open, close, point));
  }
  return candidates;
}

function pickPrimaryTurn(candidates: SwingCandidate[]): SwingCandidate {
  return [...candidates].sort((left, right) => right.totalSwingPips - left.totalSwingPips)[0];
}

function computeRetracement(prePips: number, postPips: number): number | null {
  if (prePips === 0) return postPips === 0 ? 0 : null;
  return Math.round((Math.abs(postPips) / Math.abs(prePips)) * 1000) / 10;
}

export function computeAsianTurningPointMetrics(
  tradeDate: string,
  rawCandles: readonly unknown[],
): AsianTurningPointMetrics | null {
  const bars = rawCandles
    .map((entry) => parseBar(entry as Record<string, unknown>))
    .filter((bar): bar is AsianM5Bar => bar != null);
  const windowBars = filterAsianWindow(bars, tradeDate);
  if (windowBars.length < 10) return null;

  const sessionOpen = windowBars[0].open;
  const sessionClose = windowBars[windowBars.length - 1].close;
  const sessionStartTime = `${tradeDate}${SESSION_START}.000Z`;

  let extremeHigh = -Infinity;
  let extremeHighTime = windowBars[0].time;
  let extremeLow = Infinity;
  let extremeLowTime = windowBars[0].time;

  for (const bar of windowBars) {
    if (bar.high > extremeHigh) {
      extremeHigh = bar.high;
      extremeHighTime = bar.time;
    }
    if (bar.low < extremeLow) {
      extremeLow = bar.low;
      extremeLowTime = bar.time;
    }
  }

  const primary = pickPrimaryTurn(collectSwingCandidates(
    windowBars,
    sessionOpen,
    sessionClose,
    extremeLow,
    extremeLowTime,
    extremeHigh,
    extremeHighTime,
  ));

  const preMinutes = minutesBetween(sessionStartTime, primary.turnTime);
  const postMinutes = minutesBetween(primary.turnTime, windowBars[windowBars.length - 1].time);
  const preSpeed = preMinutes > 0
    ? Math.round((Math.abs(primary.prePips) / preMinutes) * 1000) / 1000
    : 0;
  const postSpeed = postMinutes > 0
    ? Math.round((Math.abs(primary.postPips) / postMinutes) * 1000) / 1000
    : 0;
  const retracementPct = computeRetracement(primary.prePips, primary.postPips);

  if (retracementPct == null) return null;

  return {
    turnTime: primary.turnTime,
    preTurnSpeed: preSpeed,
    postTurnSpeed: postSpeed,
    postTurnPips: primary.postPips,
    postTurnMinutes: postMinutes,
    retracementPct,
  };
}
