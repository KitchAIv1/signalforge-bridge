import type { AmdTag, AmdDateFeatures, AsianCloseBiasSignal, JudasDirection } from './amdTypes.js';

export type OhlcCandle = {
  time: string;
  mid: { o: string; h: string; l: string; c: string };
  complete: boolean;
};

function utcHourFromIso(iso: string): number {
  return new Date(iso).getUTCHours();
}

function safeParseMid(
  candle: OhlcCandle,
  field: 'o' | 'h' | 'l' | 'c'
): number | null {
  const raw = candle.mid?.[field];
  if (raw === undefined || raw === null) return null;
  const n = parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
}

function computeCompressionBreakout(
  judas_direction: JudasDirection | null,
  londonOpenPrice: number | null,
  distCandles: OhlcCandle[]
): boolean {
  if (londonOpenPrice === null || distCandles.length === 0) return false;
  const distCloses = distCandles
    .map((c) => safeParseMid(c, 'c'))
    .filter((v): v is number => v !== null);
  if (distCloses.length === 0) return false;
  const bestDistClose =
    judas_direction === 'UP'
      ? Math.max(...distCloses)
      : Math.min(...distCloses);
  if (judas_direction === 'UP') {
    return bestDistClose - londonOpenPrice > 0.001;
  }
  if (judas_direction === 'DOWN') {
    return londonOpenPrice - bestDistClose > 0.001;
  }
  return false;
}

function computeDelayedDistribution(
  byHour: Map<number, OhlcCandle>,
  distCandles: OhlcCandle[],
  londonOpenPrice: number | null
): boolean {
  const nyCandles: OhlcCandle[] = [];
  for (const h of [17, 18, 19, 20, 21]) {
    const c = byHour.get(h);
    if (c) nyCandles.push(c);
  }
  if (nyCandles.length < 2 || londonOpenPrice === null) return false;
  const nyCloses = nyCandles
    .map((c) => safeParseMid(c, 'c'))
    .filter((v): v is number => v !== null);
  if (nyCloses.length === 0) return false;
  const nyHigh = Math.max(
    ...nyCandles.map((c) => safeParseMid(c, 'h') ?? 0)
  );
  const nyLow = Math.min(
    ...nyCandles.map((c) => safeParseMid(c, 'l') ?? Infinity)
  );
  const nyRange = Math.round((nyHigh - nyLow) * 10000);
  const distRange =
    distCandles.length > 0
      ? (() => {
          const dh = Math.max(
            ...distCandles.map((c) => safeParseMid(c, 'h') ?? 0)
          );
          const dl = Math.min(
            ...distCandles.map((c) => safeParseMid(c, 'l') ?? Infinity)
          );
          return Math.round((dh - dl) * 10000);
        })()
      : 0;
  return nyRange > 25 && distRange < 20;
}

export function groupCandlesByUtcHour(
  candles: OhlcCandle[]
): Map<number, OhlcCandle> {
  const byHour = new Map<number, OhlcCandle>();
  for (const c of candles) {
    const h = utcHourFromIso(c.time);
    if (!byHour.has(h)) byHour.set(h, c);
  }
  return byHour;
}

function asianRangeFromCandles(
  asianCandles: OhlcCandle[],
  onBadCandle: (candle: OhlcCandle, reason: string) => void
): number | null {
  if (asianCandles.length < 4) return null;
  const highs: number[] = [];
  const lows: number[] = [];
  for (const ac of asianCandles) {
    const hi = safeParseMid(ac, 'h');
    const lo = safeParseMid(ac, 'l');
    if (hi === null || lo === null) {
      onBadCandle(ac, 'missing or bad asian mid.h/mid.l');
      return null;
    }
    highs.push(hi);
    lows.push(lo);
  }
  if (highs.length !== asianCandles.length) return null;
  const asian_high = Math.max(...highs);
  const asian_low = Math.min(...lows);
  return Math.round((asian_high - asian_low) * 10000);
}

function asianNetAndFlatFromCandles(
  asianCandles: OhlcCandle[],
  asian_range_pips: number | null
): {
  asian_net_pips: number | null;
  asian_is_flat: boolean;
  accumulation_quality_score: number | null;
} {
  let asian_net_pips: number | null = null;
  let asian_is_flat = false;
  let accumulation_quality_score: number | null = null;
  if (
    asianCandles.length >= 4 &&
    asian_range_pips !== null &&
    asian_range_pips > 0
  ) {
    const asianOpen = safeParseMid(asianCandles[0], 'o');
    const asianClose = safeParseMid(
      asianCandles[asianCandles.length - 1],
      'c'
    );
    if (asianOpen !== null && asianClose !== null) {
      asian_net_pips = Math.round((asianClose - asianOpen) * 10000);
      const netToRangeRatio = Math.abs(asian_net_pips) / asian_range_pips;
      accumulation_quality_score =
        asian_range_pips > 0
          ? Math.round((1 - netToRangeRatio) * 100) / 100
          : null;
      const ratioFlat = netToRangeRatio <= 0.5;
      const overallUp = asian_net_pips > 0;
      let oppositeCount = 0;
      for (const ac of asianCandles) {
        const o = safeParseMid(ac, 'o');
        const c = safeParseMid(ac, 'c');
        if (o === null || c === null) continue;
        const candleUp = c > o;
        if (overallUp && !candleUp) oppositeCount++;
        if (!overallUp && candleUp) oppositeCount++;
      }
      const oscillationRatio = oppositeCount / asianCandles.length;
      const oscillating = oscillationRatio >= 0.3;
      asian_is_flat = ratioFlat || oscillating;
    }
  }
  return { asian_net_pips, asian_is_flat, accumulation_quality_score };
}

function asianCloseBiasFromCandles(
  asianCandles: OhlcCandle[],
): {
  asian_close_position_pct: number | null;
  asian_close_bias_signal: AsianCloseBiasSignal;
} {
  if (asianCandles.length === 0) {
    return { asian_close_position_pct: null, asian_close_bias_signal: null };
  }

  const hourSeven = asianCandles.find(
    (bar) => new Date(bar.time).getUTCHours() === 7,
  );
  if (!hourSeven) {
    return { asian_close_position_pct: null, asian_close_bias_signal: null };
  }

  const highs = asianCandles.map((bar) => safeParseMid(bar, 'h'));
  const lows = asianCandles.map((bar) => safeParseMid(bar, 'l'));
  const validHighs = highs.filter((n): n is number => n !== null);
  const validLows = lows.filter((n): n is number => n !== null);
  if (validHighs.length === 0 || validLows.length === 0) {
    return { asian_close_position_pct: null, asian_close_bias_signal: null };
  }

  const asianHigh = Math.max(...validHighs);
  const asianLow = Math.min(...validLows);
  const asianClose = safeParseMid(hourSeven, 'c');

  if (asianClose === null || asianHigh === asianLow) {
    return { asian_close_position_pct: null, asian_close_bias_signal: null };
  }

  const positionPct = ((asianClose - asianLow) / (asianHigh - asianLow)) * 100;
  const rounded = Math.round(positionPct * 100) / 100;

  let signal: AsianCloseBiasSignal;
  if (rounded >= 60) signal = 'BULLISH';
  else if (rounded <= 40) signal = 'BEARISH';
  else signal = 'NEUTRAL';

  return { asian_close_position_pct: rounded, asian_close_bias_signal: signal };
}

type JudasTriple = {
  judas_direction: JudasDirection | null;
  judas_pips: number | null;
  judasExtreme: number | null;
};

function classifyJudasFromMoves(
  downMove: number,
  upMove: number,
  londonLow: number,
  londonHigh: number,
  londonClose: number
): JudasTriple {
  if (downMove > upMove && downMove > 0.0003) {
    return {
      judas_direction: 'DOWN',
      judas_pips: Math.round(downMove * 10000),
      judasExtreme: londonLow,
    };
  }
  if (upMove > downMove && upMove > 0.0003) {
    return {
      judas_direction: 'UP',
      judas_pips: Math.round(upMove * 10000),
      judasExtreme: londonHigh,
    };
  }
  return {
    judas_direction: 'FLAT',
    judas_pips: 0,
    judasExtreme: londonClose,
  };
}

function judasFromLondonCandles(londonCandles: OhlcCandle[]): JudasTriple {
  if (londonCandles.length === 0) {
    return { judas_direction: null, judas_pips: null, judasExtreme: null };
  }
  const londonHigh = Math.max(
    ...londonCandles.map((c) => safeParseMid(c, 'h') ?? -Infinity)
  );
  const londonLow = Math.min(
    ...londonCandles.map((c) => safeParseMid(c, 'l') ?? Infinity)
  );
  const londonOpen = safeParseMid(londonCandles[0], 'o');
  const londonClose = safeParseMid(
    londonCandles[londonCandles.length - 1],
    'c'
  );
  if (
    londonOpen === null ||
    londonClose === null ||
    !Number.isFinite(londonHigh) ||
    !Number.isFinite(londonLow)
  ) {
    return { judas_direction: null, judas_pips: null, judasExtreme: null };
  }
  const downMove = londonOpen - londonLow;
  const upMove = londonHigh - londonOpen;
  return classifyJudasFromMoves(
    downMove,
    upMove,
    londonLow,
    londonHigh,
    londonClose
  );
}

function reversalFromDist(
  judas_direction: JudasDirection | null,
  judasExtreme: number | null,
  asianCandles: OhlcCandle[],
  distCandles: OhlcCandle[]
): boolean | null {
  if (judas_direction === null || judasExtreme === null) return null;
  if (distCandles.length === 0) return null;
  if (judas_direction === 'DOWN') {
    const asianHighVal =
      asianCandles.length > 0
        ? Math.max(...asianCandles.map((c) => safeParseMid(c, 'h') ?? 0))
        : judasExtreme;
    const midpoint = (asianHighVal + (judasExtreme ?? asianHighVal)) / 2;
    const closes = distCandles
      .map((c) => safeParseMid(c, 'c'))
      .filter((v): v is number => v !== null);
    if (closes.length === 0) return null;
    return Math.max(...closes) > midpoint;
  }
  if (judas_direction === 'UP') {
    const asianLowVal =
      asianCandles.length > 0
        ? Math.min(
            ...asianCandles.map((c) => safeParseMid(c, 'l') ?? Infinity)
          )
        : judasExtreme;
    const midpoint = (asianLowVal + (judasExtreme ?? asianLowVal)) / 2;
    const closes = distCandles
      .map((c) => safeParseMid(c, 'c'))
      .filter((v): v is number => v !== null);
    if (closes.length === 0) return null;
    return Math.min(...closes) < midpoint;
  }
  return false;
}

function collectHourlyCandles(
  byHour: Map<number, OhlcCandle>,
  hours: readonly number[]
): OhlcCandle[] {
  const out: OhlcCandle[] = [];
  for (const hour of hours) {
    const candle = byHour.get(hour);
    if (candle) out.push(candle);
  }
  return out;
}

type SessionCandleSlices = {
  byHour: Map<number, OhlcCandle>;
  asianCandles: OhlcCandle[];
  londonCandles: OhlcCandle[];
  distCandles: OhlcCandle[];
};

function sliceSessionsByUtcHour(candles: OhlcCandle[]): SessionCandleSlices {
  const byHour = groupCandlesByUtcHour(candles);
  return {
    byHour,
    asianCandles: collectHourlyCandles(byHour, [0, 1, 2, 3, 4, 5, 6, 7]),
    londonCandles: collectHourlyCandles(byHour, [8, 9]),
    distCandles: collectHourlyCandles(byHour, [10, 11, 12, 13]),
  };
}

type AmdAssemblyInput = {
  asian_range_pips: number | null;
  asian_net_pips: number | null;
  asian_is_flat: boolean;
  judas_direction: JudasDirection | null;
  judas_pips: number | null;
  judasExtreme: number | null;
  reversal_confirmed: boolean | null;
  compression_breakout: boolean;
  delayed_distribution: boolean;
};

function assembleAmdDateFeatures(input: AmdAssemblyInput): AmdDateFeatures {
  const amd_tag: AmdTag = resolveAmdTag(
    input.asian_range_pips,
    input.reversal_confirmed,
    input.judas_pips,
    input.compression_breakout,
    input.delayed_distribution,
    input.asian_is_flat
  );
  return {
    asian_range_pips: input.asian_range_pips,
    asian_net_pips: input.asian_net_pips,
    asian_is_flat: input.asian_is_flat,
    judas_direction: input.judas_direction,
    judas_pips: input.judas_pips,
    reversal_confirmed: input.reversal_confirmed,
    compression_breakout: input.compression_breakout,
    delayed_distribution: input.delayed_distribution,
    amd_tag,
    judas_extreme_price: input.judasExtreme,
  };
}

export function computeDateFeatures(
  candles: OhlcCandle[],
  onBadCandle: (candle: OhlcCandle, reason: string) => void
): AmdDateFeatures {
  const { byHour, asianCandles, londonCandles, distCandles } =
    sliceSessionsByUtcHour(candles);
  const asian_range_pips = asianRangeFromCandles(asianCandles, onBadCandle);
  const { asian_net_pips, asian_is_flat, accumulation_quality_score } =
    asianNetAndFlatFromCandles(
    asianCandles,
    asian_range_pips
  );

  let closeBias: ReturnType<typeof asianCloseBiasFromCandles> = {
    asian_close_position_pct: null,
    asian_close_bias_signal: null,
  };
  try {
    closeBias = asianCloseBiasFromCandles(asianCandles);
  } catch (err) {
    console.error(
      `[amdFeatures] asianCloseBiasFromCandles error: ${(err as Error).message}`,
    );
  }

  const { judas_direction, judas_pips, judasExtreme } =
    judasFromLondonCandles(londonCandles);
  const reversal_confirmed = reversalFromDist(
    judas_direction,
    judasExtreme,
    asianCandles,
    distCandles
  );
  const londonOpenPrice =
    londonCandles.length > 0 ? safeParseMid(londonCandles[0], 'o') : null;
  const features = assembleAmdDateFeatures({
    asian_range_pips,
    asian_net_pips,
    asian_is_flat,
    judas_direction,
    judas_pips,
    judasExtreme,
    reversal_confirmed,
    compression_breakout: computeCompressionBreakout(
      judas_direction,
      londonOpenPrice,
      distCandles
    ),
    delayed_distribution: computeDelayedDistribution(
      byHour,
      distCandles,
      londonOpenPrice
    ),
  });
  features.asian_close_position_pct = closeBias.asian_close_position_pct;
  features.asian_close_bias_signal = closeBias.asian_close_bias_signal;
  features.accumulation_quality_score = accumulation_quality_score;
  return features;
}

function resolveAmdTag(
  asian_range_pips: number | null,
  reversal_confirmed: boolean | null,
  judas_pips: number | null,
  compression_breakout: boolean,
  delayed_distribution: boolean,
  asian_is_flat: boolean
): AmdTag {
  if (asian_range_pips === null) return 'INSUFFICIENT_DATA';

  if (asian_range_pips < 35) {
    if (asian_is_flat) {
      if (reversal_confirmed === true && (judas_pips ?? 0) >= 8) {
        return 'AMD_TEXTBOOK';
      }
      if (compression_breakout && !reversal_confirmed) {
        return 'AMD_COMPRESSION_BREAKOUT';
      }
      return 'AMD_FAILED';
    }
    return 'AMD_SHIFTED';
  }

  if (asian_range_pips < 50) return 'AMD_SHIFTED';

  return 'AMD_NONE';
}
