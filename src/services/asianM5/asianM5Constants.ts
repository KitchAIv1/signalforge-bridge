/** Asian session M5 candle fetch constants (00:00–08:00 UTC). */

export const ASIAN_M5_PAIR = 'AUD_USD';
export const ASIAN_M5_TABLE = 'asian_m5_candles';
export const ASIAN_START_UTC = '00:00:00.000000000Z';
export const ASIAN_END_UTC = '08:00:00.000000000Z';

export type AsianM5FetchStatus = 'success' | 'empty' | 'error' | 'pending';

export type AsianM5StoredCandle = {
  time: string;
  o: string;
  h: string;
  l: string;
  c: string;
};
