import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ASIAN_M5_PAIR,
  ASIAN_M5_TABLE,
  type AsianM5StoredCandle,
} from '../asianM5/asianM5Constants.js';

export async function fetchAsianM5Candles(
  supabaseDb: SupabaseClient,
  tradeDate: string,
): Promise<AsianM5StoredCandle[] | null> {
  const { data, error } = await supabaseDb
    .from(ASIAN_M5_TABLE)
    .select('candles, fetch_status')
    .eq('trade_date', tradeDate)
    .eq('pair', ASIAN_M5_PAIR)
    .maybeSingle();

  if (error) throw new Error(`fetchAsianM5Candles ${tradeDate}: ${error.message}`);
  if (!data || data.fetch_status !== 'success') return null;

  const candles = data.candles as AsianM5StoredCandle[] | null;
  if (!candles || candles.length === 0) return null;
  return candles;
}
