import type { AmdDateFeatures } from './amdTypes.js';
import type { OhlcCandle } from './amdFeatures.js';

export function buildAmdChartDataPayload(
  tradeDateUtc: string,
  candles: OhlcCandle[],
  features: AmdDateFeatures
): Record<string, unknown> {
  return {
    trade_date_utc: tradeDateUtc,
    granularity: 'H1',
    candle_count: candles.length,
    ohlc: candles.map((candle) => ({
      time: candle.time,
      o: candle.mid?.o ?? null,
      h: candle.mid?.h ?? null,
      l: candle.mid?.l ?? null,
      c: candle.mid?.c ?? null,
    })),
    features: {
      asian_range_pips: features.asian_range_pips,
      asian_net_pips: features.asian_net_pips,
      asian_is_flat: features.asian_is_flat,
      judas_direction: features.judas_direction,
      judas_pips: features.judas_pips,
      judas_extreme_price: features.judas_extreme_price,
      reversal_confirmed: features.reversal_confirmed,
      compression_breakout: features.compression_breakout,
      delayed_distribution: features.delayed_distribution,
      amd_tag: features.amd_tag,
    },
  };
}
