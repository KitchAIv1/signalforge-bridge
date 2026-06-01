/** Distribution session M5 candle fetch constants (10:00–16:00 UTC). */

export const DISTRIBUTION_M5_PAIR = 'AUD_USD';
export const DISTRIBUTION_M5_TABLE = 'amd_m5_distribution_candles';
export const DISTRIBUTION_START_UTC = '10:00:00.000000000Z';
export const DISTRIBUTION_END_UTC = '16:00:00.000000000Z';

export type DistributionM5FetchStatus = 'success' | 'empty' | 'error' | 'pending';

export type DistributionM5StoredCandle = {
  time: string;
  o: string;
  h: string;
  l: string;
  c: string;
};
