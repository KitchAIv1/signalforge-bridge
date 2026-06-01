import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  AUD_USD_PAIR,
  BACKFILL_START_DATE,
  MAX_RETRIES,
  RATE_LIMIT_MS,
  type AmdStateBackfillRow,
  type BackfillSummary,
  type DayBackfillResult,
} from './types.js';
import { decisionEvaluatedAtIso } from './fetchWindows.js';
import { isSuspicious1031Tag } from './filterH1At1031.js';
import { reconstructDecisionAt1031 } from './reconstructDay.js';
import { printCsvPreview, printChangedDowDistribution, writeBackfillCsv } from './csvWriter.js';
import { formatDayProgressLine, logMilestone } from './progressLog.js';
import { assertGroundTruth, GROUND_TRUTH_TRADE_DATE } from './groundTruthGate.js';

function emptyD1Fields(): Pick<
  DayBackfillResult,
  | 'd1_bars_raw'
  | 'd1_bars_used'
  | 'd1_last_dropped_time'
  | 'layer4_bullish'
  | 'layer4_bearish'
  | 'layer4_d1_bias'
> {
  return {
    d1_bars_raw: null,
    d1_bars_used: null,
    d1_last_dropped_time: null,
    layer4_bullish: null,
    layer4_bearish: null,
    layer4_d1_bias: null,
  };
}

export function buildSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('[DecisionBackfill] Missing SUPABASE_URL or service key');
  }
  return createClient(supabaseUrl, supabaseKey);
}

export function isDryRunMode(): boolean {
  const raw = process.env.DRY_RUN?.trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAmdStateRows(
  supabase: SupabaseClient,
): Promise<AmdStateBackfillRow[]> {
  const { data, error } = await supabase
    .from('amd_state')
    .select('trade_date, auto_direction, decision_auto_direction, amd_tag')
    .eq('pair', AUD_USD_PAIR)
    .gte('trade_date', BACKFILL_START_DATE)
    .order('trade_date', { ascending: true });

  if (error) {
    throw new Error(`[DecisionBackfill] Fetch amd_state failed: ${error.message}`);
  }

  return (data ?? []) as AmdStateBackfillRow[];
}

async function reconstructWithRetry(tradeDate: string): Promise<ReturnType<typeof reconstructDecisionAt1031>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await reconstructDecisionAt1031(tradeDate);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await sleep(RATE_LIMIT_MS * attempt);
      }
    }
  }
  throw lastError;
}

async function writeDecisionSnapshot(
  supabase: SupabaseClient,
  tradeDate: string,
  decisionDirection: string,
): Promise<void> {
  const { error } = await supabase
    .from('amd_state')
    .update({
      decision_auto_direction: decisionDirection,
      decision_evaluated_at: decisionEvaluatedAtIso(tradeDate),
    })
    .eq('pair', AUD_USD_PAIR)
    .eq('trade_date', tradeDate)
    .is('decision_auto_direction', null);

  if (error) {
    throw new Error(`[DecisionBackfill] Update ${tradeDate} failed: ${error.message}`);
  }
}

function buildSummary(
  rows: DayBackfillResult[],
  dryRun: boolean,
): BackfillSummary {
  const computedRows = rows.filter((row) => row.status === 'computed');
  return {
    total: rows.length,
    computed: computedRows.length,
    skipped_existing: rows.filter((row) => row.status === 'skipped_existing').length,
    same_as_db: computedRows.filter((row) => !row.changed).length,
    changed_from_db: computedRows.filter((row) => row.changed).length,
    flagged_tag_count: computedRows.filter((row) => row.flagged_tag).length,
    errors: rows.filter((row) => row.status === 'error').length,
    dry_run: dryRun,
  };
}

async function processDay(
  supabase: SupabaseClient,
  dbRow: AmdStateBackfillRow,
  dryRun: boolean,
): Promise<DayBackfillResult> {
  if (dbRow.decision_auto_direction) {
    return {
      trade_date: dbRow.trade_date,
      status: 'skipped_existing',
      amd_tag_computed: null,
      decision_direction: dbRow.decision_auto_direction,
      auto_direction_db: dbRow.auto_direction,
      changed: false,
      flagged_tag: false,
      error_message: null,
      asian_is_flat: null,
      reversal_confirmed: null,
      ...emptyD1Fields(),
    };
  }

  try {
    const reconstructed = await reconstructWithRetry(dbRow.trade_date);
    const decisionDirection = reconstructed.autoSnapshot.auto_direction;
    const flaggedTag = isSuspicious1031Tag(reconstructed.amdTag);
    const changed = decisionDirection !== dbRow.auto_direction;

    if (!dryRun && !flaggedTag) {
      await writeDecisionSnapshot(supabase, dbRow.trade_date, decisionDirection);
    }

    return {
      trade_date: dbRow.trade_date,
      status: 'computed',
      amd_tag_computed: reconstructed.amdTag,
      decision_direction: decisionDirection,
      auto_direction_db: dbRow.auto_direction,
      changed,
      flagged_tag: flaggedTag,
      error_message: null,
      asian_is_flat: reconstructed.asianIsFlat,
      reversal_confirmed: reconstructed.reversalConfirmed,
      d1_bars_raw: reconstructed.d1BarsRaw,
      d1_bars_used: reconstructed.d1BarsUsed,
      d1_last_dropped_time: reconstructed.d1LastDroppedTime,
      layer4_bullish: reconstructed.layer4Bullish,
      layer4_bearish: reconstructed.layer4Bearish,
      layer4_d1_bias: reconstructed.layer4D1Bias,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      trade_date: dbRow.trade_date,
      status: 'error',
      amd_tag_computed: null,
      decision_direction: null,
      auto_direction_db: dbRow.auto_direction,
      changed: false,
      flagged_tag: false,
      error_message: message,
      asian_is_flat: null,
      reversal_confirmed: null,
      ...emptyD1Fields(),
    };
  }
}

export async function runDecisionDirectionBackfill(): Promise<void> {
  const dryRun = isDryRunMode();
  const supabase = buildSupabaseClient();
  const dbRows = await fetchAmdStateRows(supabase);

  console.log(
    `[DecisionBackfill] Starting ${dryRun ? 'DRY_RUN' : 'LIVE'} — ` +
      `${dbRows.length} rows since ${BACKFILL_START_DATE}`,
  );

  const results: DayBackfillResult[] = [];
  const startedAt = Date.now();
  let computedCount = 0;
  let changedCount = 0;
  let flaggedCount = 0;
  let errorCount = 0;

  for (let index = 0; index < dbRows.length; index++) {
    const dbRow = dbRows[index];
    const dayResult = await processDay(supabase, dbRow, dryRun);
    results.push(dayResult);

    if (dayResult.status === 'computed') computedCount++;
    if (dayResult.changed) changedCount++;
    if (dayResult.flagged_tag) flaggedCount++;
    if (dayResult.status === 'error') errorCount++;

    console.log(
      formatDayProgressLine(index, dbRows.length, dayResult, Date.now() - startedAt),
    );
    logMilestone(index, dbRows.length, computedCount, changedCount, flaggedCount, errorCount);

    if (dayResult.flagged_tag) {
      console.warn(
        `[DecisionBackfill] FLAG ${dbRow.trade_date} — suspicious tag ` +
          `${dayResult.amd_tag_computed} at 10:31 reconstruction`,
      );
    }

    assertGroundTruth(dayResult);

    if (index < dbRows.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  const summary = buildSummary(results, dryRun);
  const csvPath = writeBackfillCsv(results);

  console.log('\n=== Summary ===');
  console.log(`DRY_RUN:              ${summary.dry_run}`);
  console.log(`Total rows:           ${summary.total}`);
  console.log(`Computed:             ${summary.computed}`);
  console.log(`Skipped (existing):   ${summary.skipped_existing}`);
  console.log(`Same as auto_direction_db: ${summary.same_as_db}`);
  console.log(`Changed from DB:      ${summary.changed_from_db}`);
  console.log(`Flagged tag count:    ${summary.flagged_tag_count}`);
  console.log(`Errors:               ${summary.errors}`);
  console.log(`CSV:                  ${csvPath}`);

  printCsvPreview(results, 20);
  printChangedDowDistribution(results);

  const groundTruthRow = results.find((row) => row.trade_date === GROUND_TRUTH_TRADE_DATE);
  console.log('\n--- Ground truth row ---');
  if (groundTruthRow) {
    console.log(JSON.stringify(groundTruthRow, null, 2));
    console.log(
      `\nGround truth check: ${GROUND_TRUTH_TRADE_DATE} = ${groundTruthRow.decision_direction} ` +
        `(expected long) — PASS`,
    );
  } else {
    console.log(`No row for ${GROUND_TRUTH_TRADE_DATE}`);
  }

  const todayUtc = new Date().toISOString().slice(0, 10);
  const todayRow = results.find((row) => row.trade_date === todayUtc);
  console.log('\n--- Today row ---');
  if (todayRow) {
    console.log(JSON.stringify(todayRow, null, 2));
  } else {
    console.log(`No row for ${todayUtc}`);
  }

  if (summary.flagged_tag_count > 0) {
    console.error(
      '\n[DecisionBackfill] ABORT — hour-10 filter broken. ' +
        `${summary.flagged_tag_count} TEXTBOOK/COMPRESSION tags detected.`,
    );
    process.exit(1);
  }

  if (summary.errors > 0) {
    console.error(`\n[DecisionBackfill] Completed with ${summary.errors} errors.`);
    process.exit(1);
  }
}
