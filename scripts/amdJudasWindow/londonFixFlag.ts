import type { M5Bar } from '../regimeVsAmd/regimeVsAmdM5Walk.js';

const FIX_SPIKE_BODY_PIPS = 8;
const FIX_SPIKE_BODY_MIN_FRAC = 0.6;

function fixWindowBars(m5Candles: M5Bar[]): M5Bar[] {
  return m5Candles.filter((bar) => {
    const hourUtc = new Date(bar.time).getUTCHours();
    return hourUtc === 10 || hourUtc === 11;
  });
}

function isDirectionalFixSpike(bar: M5Bar): boolean {
  const open = parseFloat(bar.o);
  const close = parseFloat(bar.c);
  const high = parseFloat(bar.h);
  const low = parseFloat(bar.l);
  if (
    !Number.isFinite(open) ||
    !Number.isFinite(close) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low)
  ) {
    return false;
  }
  const range = high - low;
  if (range === 0) return false;
  const body = Math.abs(close - open);
  return (
    body >= FIX_SPIKE_BODY_PIPS / 10000 &&
    body / range >= FIX_SPIKE_BODY_MIN_FRAC
  );
}

export function isPotentialLondonFixDay(m5Candles: M5Bar[]): boolean {
  const fixBars = fixWindowBars(m5Candles);
  return fixBars.some(isDirectionalFixSpike);
}
