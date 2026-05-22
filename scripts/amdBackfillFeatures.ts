import type {
  AmdTag,
  DateFeatures,
  JudasDirection,
  AmdTradePhase,
  SessionDirectionAlignment,
} from './amdBackfillTypes.ts';

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

/**
 * Groups candles by UTC hour; picks first candle per hour if duplicates.
 */
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

export function computeDateFeatures(
  candles: OhlcCandle[],
  onBadCandle: (candle: OhlcCandle, reason: string) => void
): DateFeatures {
  const byHour = groupCandlesByUtcHour(candles);

  const asianCandles: OhlcCandle[] = [];
  for (let hour = 0; hour < 8; hour++) {
    const c = byHour.get(hour);
    if (c) asianCandles.push(c);
  }

  let asian_range_pips: number | null = null;
  if (asianCandles.length < 4) {
    asian_range_pips = null;
  } else {
    const highs: number[] = [];
    const lows: number[] = [];
    for (const ac of asianCandles) {
      const hi = safeParseMid(ac, 'h');
      const lo = safeParseMid(ac, 'l');
      if (hi === null || lo === null) {
        onBadCandle(ac, 'missing or bad asian mid.h/mid.l');
        asian_range_pips = null;
        break;
      }
      highs.push(hi);
      lows.push(lo);
    }
    if (highs.length > 0 && highs.length === asianCandles.length) {
      const asian_high = Math.max(...highs);
      const asian_low = Math.min(...lows);
      asian_range_pips = Math.round((asian_high - asian_low) * 10000);
    }
  }

  let asian_net_pips: number | null = null;
  let asian_is_flat = false;

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

  const londonCandles: OhlcCandle[] = [];
  for (const h of [8, 9]) {
    const c = byHour.get(h);
    if (c) londonCandles.push(c);
  }

  let judas_direction: JudasDirection | null = null;
  let judas_pips: number | null = null;
  let judasExtreme: number | null = null;

  if (londonCandles.length === 0) {
    judas_direction = null;
    judas_pips = null;
    judasExtreme = null;
  } else {
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
      judas_direction = null;
      judas_pips = null;
      judasExtreme = null;
    } else {
      const downMove = londonOpen - londonLow;
      const upMove = londonHigh - londonOpen;

      if (downMove > upMove && downMove > 0.0003) {
        judas_direction = 'DOWN';
        judas_pips = Math.round(downMove * 10000);
        judasExtreme = londonLow;
      } else if (upMove > downMove && upMove > 0.0003) {
        judas_direction = 'UP';
        judas_pips = Math.round(upMove * 10000);
        judasExtreme = londonHigh;
      } else {
        judas_direction = 'FLAT';
        judas_pips = 0;
        judasExtreme = londonClose;
      }
    }
  }

  const distCandles: OhlcCandle[] = [];
  for (const h of [10, 11, 12, 13]) {
    const c = byHour.get(h);
    if (c) distCandles.push(c);
  }

  let reversal_confirmed: boolean | null = null;
  if (judas_direction === null || judasExtreme === null) {
    reversal_confirmed = null;
  } else if (distCandles.length === 0) {
    reversal_confirmed = null;
  } else {
    if (judas_direction === 'DOWN') {
      const asianHighVal =
        asianCandles.length > 0
          ? Math.max(...asianCandles.map((c) => safeParseMid(c, 'h') ?? 0))
          : judasExtreme;
      const midpoint =
        (asianHighVal + (judasExtreme ?? asianHighVal)) / 2;
      const closes = distCandles
        .map((c) => safeParseMid(c, 'c'))
        .filter((v): v is number => v !== null);
      if (closes.length === 0) {
        reversal_confirmed = null;
      } else {
        const bestClose = Math.max(...closes);
        reversal_confirmed = bestClose > midpoint;
      }
    } else if (judas_direction === 'UP') {
      const asianLowVal =
        asianCandles.length > 0
          ? Math.min(
              ...asianCandles.map((c) => safeParseMid(c, 'l') ?? Infinity)
            )
          : judasExtreme;
      const midpoint =
        (asianLowVal + (judasExtreme ?? asianLowVal)) / 2;
      const closes = distCandles
        .map((c) => safeParseMid(c, 'c'))
        .filter((v): v is number => v !== null);
      if (closes.length === 0) {
        reversal_confirmed = null;
      } else {
        const bestClose = Math.min(...closes);
        reversal_confirmed = bestClose < midpoint;
      }
    } else {
      reversal_confirmed = false;
    }
  }

  const londonOpenPrice =
    londonCandles.length > 0 ? safeParseMid(londonCandles[0], 'o') : null;

  const compression_breakout = computeCompressionBreakout(
    judas_direction,
    londonOpenPrice,
    distCandles
  );

  const delayed_distribution = computeDelayedDistribution(
    byHour,
    distCandles,
    londonOpenPrice
  );

  const amd_tag = resolveAmdTag(
    asian_range_pips,
    reversal_confirmed,
    judas_pips,
    compression_breakout,
    delayed_distribution,
    asian_is_flat
  );

  return {
    asian_range_pips,
    asian_net_pips,
    asian_is_flat,
    judas_direction,
    judas_pips,
    reversal_confirmed,
    compression_breakout,
    delayed_distribution,
    amd_tag,
  };
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
      if (delayed_distribution && (judas_pips ?? 0) < 8) {
        return 'AMD_DELAYED';
      }
      if (reversal_confirmed === null) return 'AMD_PARTIAL';
      return 'AMD_FAILED';
    }
    return 'AMD_SHIFTED';
  }

  if (asian_range_pips < 50) return 'AMD_SHIFTED';

  return 'AMD_NONE';
}

export function amdTradePhaseFromUtcHour(hour: number): AmdTradePhase {
  if (hour >= 0 && hour <= 7) return 'ASIAN_ACCUMULATION';
  if (hour >= 8 && hour <= 9) return 'LONDON_MANIPULATION';
  if (hour >= 10 && hour <= 16) return 'DISTRIBUTION';
  if (hour >= 17 && hour <= 20) return 'NY_CONTINUATION';
  return 'OTHER';
}

export function sessionDirectionAlignment(
  judas: JudasDirection | null,
  tradeDir: string
): SessionDirectionAlignment {
  const lower = tradeDir.trim().toLowerCase();
  if (judas === null) return 'UNKNOWN';
  if (judas === 'DOWN' && lower === 'long') return 'ALIGNED';
  if (judas === 'UP' && lower === 'short') return 'ALIGNED';
  return 'COUNTER';
}
