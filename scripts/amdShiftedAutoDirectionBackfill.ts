/**
 * Recompute auto_direction for AMD_SHIFTED rows where
 * layer4_d1_bias is null but 7-candle D1 counts exist.
 *
 * Run: npx tsx scripts/amdShiftedAutoDirectionBackfill.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { computeAutoDirectionSnapshot } from '../src/services/amdDetector/amdAutoDirection.js';
import { castAmdTag } from './amdM5OutcomeBackfill/types.js';
import type {
  DailyBiasAlignment,
  JudasDirection,
  Layer4D1Bias,
} from '../src/services/amdDetector/amdTypes.js';

const AUD_AMD_PAIR = 'AUD_USD';
const ROW_DELAY_MS = 200;

const TODAY_UTC = new Date().toISOString().slice(0, 10);

function assertNotToday(tradeDate: string, allowToday: boolean): void {
  if (allowToday || tradeDate !== TODAY_UTC) return;
  throw new Error(
    `Refusing to run against today's live row (${tradeDate}). ` +
      `This script can desync auto_direction from decision_auto_direction on a live trading day. ` +
      `Re-run after market close or pass --allow-today to override (use with extreme caution).`,
  );
}

type ShiftedBackfillRow = {
  id: string;
  trade_date: string;
  amd_tag: string;
  judas_direction: JudasDirection | null;
  judas_pips: number | null;
  layer4_d1_bias: Layer4D1Bias;
  layer4_bullish_count: number | null;
  layer4_bearish_count: number | null;
  layer4_bullish_count_7: number | null;
  layer4_bearish_count_7: number | null;
  daily_bias_alignment: DailyBiasAlignment;
  reversal_confirmed: boolean | null;
  m5_vs_judas_direction: string | null;
};

function buildSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('[ShiftedBackfill] Missing SUPABASE_URL or service key');
  }
  return createClient(supabaseUrl, supabaseKey);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadShiftedNeutralRows(
  supabaseDb: SupabaseClient,
): Promise<ShiftedBackfillRow[]> {
  const { data, error } = await supabaseDb
    .from('amd_state')
    .select(
      'id, trade_date, amd_tag, judas_direction, judas_pips, ' +
        'layer4_d1_bias, layer4_bullish_count, layer4_bearish_count, ' +
        'layer4_bullish_count_7, layer4_bearish_count_7, daily_bias_alignment, ' +
        'reversal_confirmed, m5_vs_judas_direction',
    )
    .eq('pair', AUD_AMD_PAIR)
    .eq('amd_tag', 'AMD_SHIFTED')
    .eq('auto_direction', 'neutral')
    .is('layer4_d1_bias', null)
    .not('layer4_bullish_count_7', 'is', null)
    .order('trade_date', { ascending: true });

  if (error) {
    throw new Error(`[ShiftedBackfill] Load failed: ${error.message}`);
  }

  return (data ?? []) as ShiftedBackfillRow[];
}

async function updateRowDirection(
  supabaseDb: SupabaseClient,
  row: ShiftedBackfillRow,
  allowToday: boolean,
): Promise<void> {
  assertNotToday(row.trade_date, allowToday);

  const autoDir = computeAutoDirectionSnapshot(
    castAmdTag(row.amd_tag),
    row.judas_direction,
    row.layer4_d1_bias,
    row.layer4_bullish_count,
    row.layer4_bearish_count,
    row.layer4_bullish_count_7,
    row.layer4_bearish_count_7,
    row.daily_bias_alignment,
    row.reversal_confirmed,
    row.judas_pips,
    null,
  );

  const { error } = await supabaseDb
    .from('amd_state')
    .update({
      auto_direction: autoDir.auto_direction,
      auto_direction_confidence: autoDir.auto_direction_confidence,
      auto_direction_reason: autoDir.auto_direction_reason,
      amd_size_multiplier: autoDir.amd_size_multiplier,
    })
    .eq('id', row.id);

  if (error) {
    throw new Error(`[ShiftedBackfill] Update ${row.trade_date} failed: ${error.message}`);
  }

  console.log(
    `[ShiftedBackfill] ${row.trade_date} | was=neutral → ` +
      `now=${autoDir.auto_direction} (${autoDir.auto_direction_confidence}) | ` +
      `reason=${autoDir.auto_direction_reason}`,
  );
}

async function logVerification(supabaseDb: SupabaseClient): Promise<void> {
  const { data, error } = await supabaseDb
    .from('amd_state')
    .select(
      'trade_date, auto_direction, auto_direction_reason, ' +
        'layer4_bullish_count_7, layer4_bearish_count_7, layer4_d1_bias_7',
    )
    .eq('pair', AUD_AMD_PAIR)
    .eq('amd_tag', 'AMD_SHIFTED')
    .is('layer4_d1_bias', null)
    .not('layer4_bullish_count_7', 'is', null)
    .order('trade_date', { ascending: true });

  if (error) {
    throw new Error(`[ShiftedBackfill] Verification query failed: ${error.message}`);
  }

  console.log('[ShiftedBackfill] Verification:');
  console.log(JSON.stringify(data, null, 2));
}

async function main(): Promise<void> {
  const allowToday = process.argv.includes('--allow-today');
  const supabaseDb = buildSupabaseClient();
  const rows = await loadShiftedNeutralRows(supabaseDb);

  const directionCounts = { long: 0, short: 0, neutral: 0 };

  for (let index = 0; index < rows.length; index++) {
    await updateRowDirection(supabaseDb, rows[index]!, allowToday);
    const { data: updated } = await supabaseDb
      .from('amd_state')
      .select('auto_direction')
      .eq('id', rows[index]!.id)
      .maybeSingle();
    const dir = updated?.auto_direction as keyof typeof directionCounts;
    if (dir in directionCounts) directionCounts[dir] += 1;
    if (index < rows.length - 1) await sleep(ROW_DELAY_MS);
  }

  console.log(
    `[ShiftedBackfill] Complete. ${rows.length} rows updated. ` +
      `long: ${directionCounts.long} short: ${directionCounts.short} ` +
      `neutral: ${directionCounts.neutral}`,
  );

  await logVerification(supabaseDb);
}

main().catch((err: unknown) => {
  console.error('[ShiftedBackfill] Fatal:', err);
  process.exit(1);
});
