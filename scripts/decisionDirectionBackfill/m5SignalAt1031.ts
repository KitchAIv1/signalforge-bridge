import { fetchCompletedCandles } from '../../src/connectors/oanda.js';
import type { AmdM5Signal, JudasDirection } from '../../src/services/amdDetector/amdTypes.js';
import { AUD_USD_PAIR } from './types.js';
import { amdM5FetchWindow } from './fetchWindows.js';

export async function fetchM5SignalAt1031(
  tradeDate: string,
  judasDirection: JudasDirection | null,
): Promise<AmdM5Signal> {
  const empty: AmdM5Signal = {
    m5_first_3_net_pips: null,
    m5_vs_judas_direction: null,
    m5_first_candle_direction: null,
    m5_evaluated_at: null,
  };

  if (!judasDirection || judasDirection === 'FLAT') {
    return empty;
  }

  const { fromISO, toISO } = amdM5FetchWindow(tradeDate);
  const raw = await fetchCompletedCandles(AUD_USD_PAIR, 'M5', fromISO, toISO);
  if (!raw || raw.length === 0) return empty;

  const candles = raw
    .map((c) => ({
      o: parseFloat(c.mid.o),
      c: parseFloat(c.mid.c),
      time: c.time,
    }))
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  if (candles.length === 0) return empty;

  const first = candles[0];
  const firstThree = candles.slice(0, 3);
  const netPips =
    firstThree.reduce((sum, candle) => sum + (candle.c - candle.o), 0) * 10000;

  const firstBody = Math.abs(first.c - first.o);
  const firstDir: 'bullish' | 'bearish' | 'doji' =
    firstBody < 0.0002
      ? 'doji'
      : first.c > first.o
        ? 'bullish'
        : 'bearish';

  const netDir: 'bullish' | 'bearish' | 'neutral' =
    netPips > 1 ? 'bullish' : netPips < -1 ? 'bearish' : 'neutral';

  let m5VsJudas: 'WITH_JUDAS' | 'AGAINST_JUDAS' | 'NEUTRAL';
  if (netDir === 'neutral') {
    m5VsJudas = 'NEUTRAL';
  } else if (judasDirection === 'UP') {
    m5VsJudas = netDir === 'bearish' ? 'AGAINST_JUDAS' : 'WITH_JUDAS';
  } else {
    m5VsJudas = netDir === 'bullish' ? 'AGAINST_JUDAS' : 'WITH_JUDAS';
  }

  return {
    m5_first_3_net_pips: parseFloat(netPips.toFixed(4)),
    m5_vs_judas_direction: m5VsJudas,
    m5_first_candle_direction: firstDir,
    m5_evaluated_at: `${tradeDate}T10:31:00.000Z`,
  };
}
