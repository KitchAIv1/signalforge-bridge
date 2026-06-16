/**
 * AMD M5 signal + outcome historical backfill.
 *
 * Backfills m5_* columns (OANDA M5 10:00–10:30 UTC) and amd_outcome_* columns
 * (H1 00:00–16:30 UTC) for specific trade dates. Recomputes auto_direction
 * when M5 is written so FAILED M5 logic matches production.
 *
 * Run:
 *   npx tsx scripts/amdM5OutcomeBackfill.ts
 *   npx tsx scripts/amdM5OutcomeBackfill.ts --dates 2026-05-22,2026-05-25
 *   npx tsx scripts/amdM5OutcomeBackfill.ts --from 2026-05-21 --to 2026-05-26
 *   npx tsx scripts/amdM5OutcomeBackfill.ts --m5-only
 *   npx tsx scripts/amdM5OutcomeBackfill.ts --outcome-only
 *   npx tsx scripts/amdM5OutcomeBackfill.ts --force-outcome
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { computeAutoDirectionSnapshot } from '../src/services/amdDetector/amdAutoDirection.js';
import type { AmdM5Signal } from '../src/services/amdDetector/amdTypes.js';
import { backfillOutcomeForDate } from './amdM5OutcomeBackfill/backfillOutcomeForDate.js';
import { fetchM5SignalForDate } from './amdM5OutcomeBackfill/fetchM5SignalForDate.js';
import {
  fetchWindowOutcomeForDate,
} from '../src/services/amdDetector/fetchWindowOutcomeForDate.js';
import { parseCliArgs } from './amdM5OutcomeBackfill/parseCliArgs.js';
import {
  castAmdTag,
  type AmdM5OutcomeBackfillRow,
  type BackfillMode,
} from './amdM5OutcomeBackfill/types.js';

const AUD_AMD_PAIR = 'AUD_USD';

const TODAY_UTC = new Date().toISOString().slice(0, 10);

function assertNotToday(tradeDate: string, allowToday: boolean): void {
  if (allowToday || tradeDate !== TODAY_UTC) return;
  throw new Error(
    `Refusing to run against today's live row (${tradeDate}). ` +
      `This script can desync auto_direction from decision_auto_direction on a live trading day. ` +
      `Re-run after market close or pass --allow-today to override (use with extreme caution).`,
  );
}

function buildSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('[M5OutcomeBackfill] Missing SUPABASE_URL or service key');
  }
  return createClient(supabaseUrl, supabaseKey);
}

async function fetchRowForDate(
  supabaseDb: SupabaseClient,
  tradeDate: string,
): Promise<AmdM5OutcomeBackfillRow | null> {
  const { data, error } = await supabaseDb
    .from('amd_state')
    .select(
      'id, trade_date, amd_tag, judas_direction, judas_pips, ' +
        'layer4_d1_bias, layer4_bullish_count, layer4_bearish_count, ' +
        'layer4_bullish_count_7, layer4_bearish_count_7, daily_bias_alignment, ' +
        'reversal_confirmed, m5_vs_judas_direction, amd_outcome_tag, ' +
        'auto_direction, window_direction_confirmed',
    )
    .eq('pair', AUD_AMD_PAIR)
    .eq('trade_date', tradeDate)
    .maybeSingle();

  if (error) {
    throw new Error(`[M5OutcomeBackfill] Fetch ${tradeDate} failed: ${error.message}`);
  }

  return (data as AmdM5OutcomeBackfillRow | null) ?? null;
}

async function backfillM5ForRow(
  supabaseDb: SupabaseClient,
  row: AmdM5OutcomeBackfillRow,
  allowToday: boolean,
): Promise<'skipped' | 'updated' | 'failed'> {
  if (row.m5_vs_judas_direction != null) {
    console.log(`[M5] ${row.trade_date} already has m5=${row.m5_vs_judas_direction} — skipping`);
    return 'skipped';
  }

  assertNotToday(row.trade_date, allowToday);

  const m5Signal = await fetchM5SignalForDate(row.trade_date, row.judas_direction);
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
    m5Signal.m5_vs_judas_direction,
  );

  const { error } = await supabaseDb
    .from('amd_state')
    .update(buildM5UpdatePayload(m5Signal, autoDir))
    .eq('id', row.id);

  if (error) {
    console.error(`[M5] ${row.trade_date} update failed: ${error.message}`);
    return 'failed';
  }

  console.log(
    `[M5] ${row.trade_date} | m5=${m5Signal.m5_vs_judas_direction ?? 'null'} ` +
      `(${m5Signal.m5_first_3_net_pips ?? '—'}pips) | ` +
      `auto=${autoDir.auto_direction} (${autoDir.auto_direction_confidence})`,
  );
  return 'updated';
}

function buildM5UpdatePayload(
  m5Signal: AmdM5Signal,
  autoDir: ReturnType<typeof computeAutoDirectionSnapshot>,
) {
  return {
    m5_first_3_net_pips: m5Signal.m5_first_3_net_pips,
    m5_vs_judas_direction: m5Signal.m5_vs_judas_direction,
    m5_first_candle_direction: m5Signal.m5_first_candle_direction,
    m5_evaluated_at: m5Signal.m5_evaluated_at,
    auto_direction: autoDir.auto_direction,
    auto_direction_confidence: autoDir.auto_direction_confidence,
    auto_direction_reason: autoDir.auto_direction_reason,
    amd_size_multiplier: autoDir.amd_size_multiplier,
  };
}

async function backfillWindowOutcomeForRow(
  supabaseDb: SupabaseClient,
  row: AmdM5OutcomeBackfillRow,
  forceOverwrite: boolean,
): Promise<'skipped' | 'updated' | 'failed'> {

  if (
    row.window_direction_confirmed !== null &&
    row.window_direction_confirmed !== undefined &&
    !forceOverwrite
  ) {
    console.log(
      `[Window] ${row.trade_date} already has ` +
      `window_confirmed=${row.window_direction_confirmed} — skipping`
    );
    return 'skipped';
  }

  // Use amd_outcome_tag if populated, else amd_tag
  const tagForWindow =
    (row.amd_outcome_tag != null &&
     row.amd_outcome_tag !== '')
      ? row.amd_outcome_tag
      : row.amd_tag;

  const result = await fetchWindowOutcomeForDate(
    row.trade_date,
    tagForWindow,
    row.auto_direction,
  );

  if (!result) {
    console.log(
      `[Window] ${row.trade_date} tag=${tagForWindow} ` +
      `— no window defined, skipping`
    );
    return 'skipped';
  }

  const { error } = await supabaseDb
    .from('amd_state')
    .update({
      window_tag_used: result.window_tag_used,
      window_from_utc: result.window_from_utc,
      window_to_utc: result.window_to_utc,
      window_pip_move: result.window_pip_move,
      window_direction_confirmed:
        result.window_direction_confirmed,
      window_candles: result.window_candles,
      window_evaluated_at: result.window_evaluated_at,
    })
    .eq('id', row.id);

  if (error) {
    console.error(
      `[Window] ${row.trade_date} update failed: ` +
      error.message
    );
    return 'failed';
  }

  console.log(
    `[Window] ${row.trade_date} | ` +
    `tag=${tagForWindow} | ` +
    `window=${result.window_from_utc.slice(11,16)}→` +
    `${result.window_to_utc.slice(11,16)} UTC | ` +
    `pip_move=${result.window_pip_move ?? '—'} | ` +
    `confirmed=${result.window_direction_confirmed ?? 'null'} | ` +
    `candles=${result.window_candles.length}`
  );
  return 'updated';
}

async function processTradeDate(
  supabaseDb: SupabaseClient,
  tradeDate: string,
  mode: BackfillMode,
  allowToday: boolean,
): Promise<void> {
  const row = await fetchRowForDate(supabaseDb, tradeDate);
  if (!row) {
    console.log(`[M5OutcomeBackfill] ${tradeDate} — no amd_state row, skipping`);
    return;
  }

  if (mode.runM5) {
    await backfillM5ForRow(supabaseDb, row, allowToday);
  }

  if (mode.runOutcome) {
    await backfillOutcomeForDate(
      supabaseDb,
      tradeDate,
      row.amd_tag,
      mode.forceOutcome,
      row.amd_outcome_tag,
    );
  }

  if (mode.runWindow) {
    await backfillWindowOutcomeForRow(
      supabaseDb,
      row,
      mode.forceOutcome,
    );
  }
}

async function main(): Promise<void> {
  const { tradeDates, mode, allowToday } = parseCliArgs();
  const supabaseDb = buildSupabaseClient();

  console.log(
    `[M5OutcomeBackfill] Dates: ${tradeDates.join(', ')} | ` +
      `m5=${mode.runM5} outcome=${mode.runOutcome} ` +
      `window=${mode.runWindow} force=${mode.forceOutcome} allowToday=${allowToday}`,
  );

  for (const tradeDate of tradeDates) {
    await processTradeDate(supabaseDb, tradeDate, mode, allowToday);
  }

  console.log('[M5OutcomeBackfill] Done');
}

main().catch((err: unknown) => {
  console.error('[M5OutcomeBackfill] Fatal:', err);
  process.exit(1);
});
