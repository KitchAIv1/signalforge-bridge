import { getSupabase } from '@/lib/supabase';

export interface AmdTradeEntry {
  fillPrice: number;
  direction: string;
  createdAt: string;
}

export async function fetchAmdTradeEntry(
  tradeDate: string,
): Promise<AmdTradeEntry | null> {
  const { data, error } = await getSupabase()
    .from('bridge_trade_log')
    .select('fill_price, direction, created_at')
    .eq('engine_id', 'engine_amd')
    .eq('decision', 'EXECUTED')
    .gte('created_at', `${tradeDate}T00:00:00.000Z`)
    .lt('created_at', `${tradeDate}T23:59:59.999Z`)
    .limit(1)
    .maybeSingle();

  if (error || !data?.fill_price || !data.created_at) return null;

  return {
    fillPrice: Number(data.fill_price),
    direction: String(data.direction).toLowerCase(),
    createdAt: data.created_at,
  };
}
