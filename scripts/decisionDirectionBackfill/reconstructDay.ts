import { fetchCompletedCandles } from '../../src/connectors/oanda.js';
import { computeAutoDirectionSnapshot } from '../../src/services/amdDetector/amdAutoDirection.js';
import {
  computeDateFeatures,
  type OhlcCandle,
} from '../../src/services/amdDetector/amdFeatures.js';
import { applyAsianCloseAdvisory } from '../../src/services/amdDetector/asianCloseAdvisory.js';
import { buildDailyBiasSnapshot } from './dailyBiasSnapshot.js';
import { amdH1FetchWindow } from './fetchWindows.js';
import { filterH1CandlesBeforeDistribution } from './filterH1At1031.js';
import { fetchM5SignalAt1031 } from './m5SignalAt1031.js';
import { AUD_USD_PAIR, type ReconstructedDecision } from './types.js';

export async function reconstructDecisionAt1031(
  tradeDate: string,
): Promise<ReconstructedDecision> {
  const { fromISO, toISO } = amdH1FetchWindow(tradeDate);
  const h1Raw = await fetchCompletedCandles(AUD_USD_PAIR, 'H1', fromISO, toISO);
  const h1Candles: OhlcCandle[] = filterH1CandlesBeforeDistribution(h1Raw);

  const features = computeDateFeatures(h1Candles, () => {});
  const dailyBiasBuild = await buildDailyBiasSnapshot(
    tradeDate,
    features.judas_direction,
  );
  const dailyBias = dailyBiasBuild.snapshot;
  const m5Signal = await fetchM5SignalAt1031(
    tradeDate,
    features.judas_direction,
  );

  let autoSnapshot = computeAutoDirectionSnapshot(
    features.amd_tag,
    features.judas_direction,
    dailyBias.layer4_d1_bias,
    dailyBias.layer4_bullish_count,
    dailyBias.layer4_bearish_count,
    dailyBias.layer4_bullish_count_7,
    dailyBias.layer4_bearish_count_7,
    dailyBias.daily_bias_alignment,
    features.reversal_confirmed,
    features.judas_pips,
    m5Signal.m5_vs_judas_direction,
    features.asian_range_pips,
    features.asian_net_pips,
  );

  autoSnapshot = applyAsianCloseAdvisory(
    autoSnapshot,
    features.asian_close_bias_signal ?? null,
    features.asian_close_position_pct ?? null,
  );

  return {
    amdTag: features.amd_tag,
    autoSnapshot,
    asianIsFlat: features.asian_is_flat,
    reversalConfirmed: features.reversal_confirmed,
    d1BarsRaw: dailyBiasBuild.d1BarsRaw,
    d1BarsUsed: dailyBiasBuild.d1BarsUsed,
    d1LastDroppedTime: dailyBiasBuild.d1LastDroppedTime,
    layer4Bullish: dailyBias.layer4_bullish_count,
    layer4Bearish: dailyBias.layer4_bearish_count,
    layer4D1Bias: dailyBias.layer4_d1_bias,
  };
}
