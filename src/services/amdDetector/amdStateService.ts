/**
 * Reads today's AMD advisory row from amd_state for a pair.
 */
import { createClient } from '@supabase/supabase-js';
import type {
  AmdTag,
  DailyBiasAlignment,
  JudasDirection,
  Layer4D1Bias,
} from './amdTypes.js';

export type ActiveAmdState = {
  amdTag: AmdTag;
  tradeDate: string;
  evaluatedAt: string;
  asianRangePips: number | null;
  asianIsFlat: boolean;
  judasDirection: JudasDirection | null;
  judasPips: number | null;
  reversalConfirmed: boolean | null;
  compressionBreakout: boolean;
  layer4D1Bias: Layer4D1Bias;
  layer4BullishCount: number | null;
  layer4BearishCount: number | null;
  dailyBiasAlignment: DailyBiasAlignment;
};

function utcTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function fetchLatestAmdState(
  pair: string
): Promise<ActiveAmdState | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  const tradeDateToday = utcTodayDate();
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: rowRaw, error } = await supabase
    .from('amd_state')
    .select(
      'trade_date, evaluated_at, amd_tag, asian_range_pips, asian_is_flat, ' +
        'judas_direction, judas_pips, reversal_confirmed, compression_breakout, ' +
        'layer4_d1_bias, layer4_bullish_count, layer4_bearish_count, daily_bias_alignment',
    )
    .eq('pair', pair)
    .eq('trade_date', tradeDateToday)
    .maybeSingle();

  if (error || !rowRaw) return null;

  const rec = rowRaw as unknown as Record<string, unknown>;

  return {
    amdTag: rec['amd_tag'] as AmdTag,
    tradeDate: String(rec['trade_date'] ?? ''),
    evaluatedAt: String(rec['evaluated_at'] ?? ''),
    asianRangePips:
      rec['asian_range_pips'] == null
        ? null
        : Number(rec['asian_range_pips']),
    asianIsFlat: Boolean(rec['asian_is_flat'] ?? false),
    judasDirection: (rec['judas_direction'] ?? null) as JudasDirection | null,
    judasPips:
      rec['judas_pips'] == null ? null : Number(rec['judas_pips']),
    reversalConfirmed:
      rec['reversal_confirmed'] == null
        ? null
        : Boolean(rec['reversal_confirmed']),
    compressionBreakout: Boolean(rec['compression_breakout'] ?? false),
    layer4D1Bias: (rec['layer4_d1_bias'] ?? null) as Layer4D1Bias,
    layer4BullishCount:
      rec['layer4_bullish_count'] == null
        ? null
        : Number(rec['layer4_bullish_count']),
    layer4BearishCount:
      rec['layer4_bearish_count'] == null
        ? null
        : Number(rec['layer4_bearish_count']),
    dailyBiasAlignment: (rec['daily_bias_alignment'] ??
      null) as DailyBiasAlignment,
  };
}
