import type { SupabaseClient } from '@supabase/supabase-js';

export interface D1ContextRow {
  tradeDate: string;
  direction: 'long' | 'short' | 'equal';
  netPips: number;
  rangePips: number;
  closePositionPct: number;
  bodyPct: number;
  upperWickPct: number;
  lowerWickPct: number;
}

export type D1MomentumSignal =
  | 'STRONG_CONTINUATION'
  | 'WEAK_CONTINUATION'
  | 'EXHAUSTION_BUILDING'
  | 'NEUTRAL';

export async function fetchPriorD1Context(
  supabase: SupabaseClient,
  todayUtc: string,
): Promise<D1ContextRow | null> {
  const { data, error } = await supabase
    .from('d1_candles')
    .select(
      'trade_date, direction, net_pips, range_pips, ' +
        'close_position_pct, body_pct, upper_wick_pct, lower_wick_pct',
    )
    .eq('pair', 'AUD_USD')
    .lt('trade_date', todayUtc)
    .order('trade_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as {
    trade_date: string;
    direction: string;
    net_pips: number;
    range_pips: number;
    close_position_pct: number;
    body_pct: number;
    upper_wick_pct: number;
    lower_wick_pct: number;
  };

  return {
    tradeDate: row.trade_date,
    direction: row.direction as 'long' | 'short' | 'equal',
    netPips: Number(row.net_pips),
    rangePips: Number(row.range_pips),
    closePositionPct: Number(row.close_position_pct),
    bodyPct: Number(row.body_pct),
    upperWickPct: Number(row.upper_wick_pct),
    lowerWickPct: Number(row.lower_wick_pct),
  };
}

export function computeD1MomentumSignal(d1: D1ContextRow): D1MomentumSignal {
  if (d1.direction === 'equal') return 'NEUTRAL';

  const isShort = d1.direction === 'short';
  const strongClose = isShort
    ? d1.closePositionPct < 20
    : d1.closePositionPct > 80;
  const strongBody = d1.bodyPct > 60;
  const exhaustionWick = isShort ? d1.upperWickPct > 30 : d1.lowerWickPct > 30;
  const weakBody = d1.bodyPct < 40;

  if (strongBody && strongClose) return 'STRONG_CONTINUATION';
  if (exhaustionWick || (weakBody && !strongClose)) return 'EXHAUSTION_BUILDING';
  if (strongBody && !strongClose) return 'WEAK_CONTINUATION';
  return 'NEUTRAL';
}
