import { fetchCompletedCandles } from '../../src/connectors/oanda.js';
import type {
  AmdDailyBiasSnapshot,
  DailyBiasAlignment,
  JudasDirection,
  Layer4D1Bias,
} from '../../src/services/amdDetector/amdTypes.js';
import { AUD_USD_PAIR } from './types.js';
import { d1BiasFetchWindow } from './fetchWindows.js';
import { filterD1CandlesAt1031 } from './filterD1At1031.js';

function countTrendVotesFromD1Bars(
  bars: ReadonlyArray<{ mid: { o: string; c: string } }>,
): { bullishCount: number; bearishCount: number } {
  let bullishCount = 0;
  let bearishCount = 0;
  for (const candleEntry of bars) {
    const openPx = parseFloat(candleEntry.mid.o);
    const closePx = parseFloat(candleEntry.mid.c);
    if (!Number.isFinite(openPx) || !Number.isFinite(closePx)) continue;
    if (closePx > openPx) bullishCount++;
    else if (closePx < openPx) bearishCount++;
  }
  return { bullishCount, bearishCount };
}

function d1BiasVotesFromBars(
  completedBars: ReadonlyArray<{ mid: { o: string; h: string; l: string; c: string } }>,
): Pick<
  AmdDailyBiasSnapshot,
  | 'layer4_d1_bias'
  | 'layer4_bullish_count'
  | 'layer4_bearish_count'
  | 'layer4_bullish_count_7'
  | 'layer4_bearish_count_7'
  | 'layer4_d1_bias_7'
> {
  if (completedBars.length === 0) {
    return {
      layer4_d1_bias: null,
      layer4_bullish_count: null,
      layer4_bearish_count: null,
      layer4_bullish_count_7: null,
      layer4_bearish_count_7: null,
      layer4_d1_bias_7: null,
    };
  }

  const last5 = completedBars.slice(-5);
  const { bullishCount: bull5, bearishCount: bear5 } =
    countTrendVotesFromD1Bars(last5);
  const layer4_d1_bias: Layer4D1Bias =
    bull5 >= 3 ? 'TRENDING_UP' : bear5 >= 3 ? 'TRENDING_DOWN' : 'RANGING';

  let bull7: number | null = null;
  let bear7: number | null = null;
  let bias7: Layer4D1Bias = null;

  if (completedBars.length >= 7) {
    const last7 = completedBars.slice(-7);
    const votes7 = countTrendVotesFromD1Bars(last7);
    bull7 = votes7.bullishCount;
    bear7 = votes7.bearishCount;
    bias7 =
      bull7 >= 4 ? 'TRENDING_UP' : bear7 >= 4 ? 'TRENDING_DOWN' : 'RANGING';
  }

  return {
    layer4_d1_bias,
    layer4_bullish_count: bull5,
    layer4_bearish_count: bear5,
    layer4_bullish_count_7: bull7,
    layer4_bearish_count_7: bear7,
    layer4_d1_bias_7: bias7,
  };
}

function computeDailyBiasAlignment(
  judasDirection: JudasDirection | null,
  layer4D1Bias: Layer4D1Bias,
): DailyBiasAlignment {
  if (!judasDirection || judasDirection === 'FLAT') return null;
  if (!layer4D1Bias) return null;
  if (layer4D1Bias === 'RANGING') return 'RANGING';
  if (judasDirection === 'UP') {
    if (layer4D1Bias === 'TRENDING_DOWN') return 'ALIGNED';
    if (layer4D1Bias === 'TRENDING_UP') return 'CONFLICTED';
  }
  if (judasDirection === 'DOWN') {
    if (layer4D1Bias === 'TRENDING_UP') return 'ALIGNED';
    if (layer4D1Bias === 'TRENDING_DOWN') return 'CONFLICTED';
  }
  return null;
}

export type DailyBiasBuildResult = {
  snapshot: AmdDailyBiasSnapshot;
  d1BarsRaw: number;
  d1BarsUsed: number;
  d1LastDroppedTime: string | null;
};

export async function buildDailyBiasSnapshot(
  tradeDate: string,
  judasDirection: JudasDirection | null,
): Promise<DailyBiasBuildResult> {
  const { fromISO, toISO } = d1BiasFetchWindow(tradeDate);
  const d1Raw = await fetchCompletedCandles(AUD_USD_PAIR, 'D', fromISO, toISO);
  const { d1Candles, d1BarsRaw, d1BarsUsed, d1LastDroppedTime } =
    filterD1CandlesAt1031(d1Raw);
  const votesRow = d1BiasVotesFromBars(d1Candles);
  return {
    snapshot: {
      ...votesRow,
      daily_bias_alignment: computeDailyBiasAlignment(
        judasDirection,
        votesRow.layer4_d1_bias,
      ),
    },
    d1BarsRaw,
    d1BarsUsed,
    d1LastDroppedTime,
  };
}
