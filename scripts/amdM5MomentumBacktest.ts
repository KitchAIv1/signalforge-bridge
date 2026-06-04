/**
 * AMD M5 momentum backtest — W1 (10:00–10:15) vs W2 (10:15–10:30).
 * READ-ONLY research — reads amd_state + amd_m5_distribution_candles.
 *
 * Run: npx ts-node -P tsconfig.amd-tc-backtest.json scripts/amdM5MomentumBacktest.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

dotenv.config();

const PAIR = 'AUD_USD';
const OUTCOME_TEXTBOOK = 'AMD_TEXTBOOK';
const OUTCOME_COMPRESSION = 'AMD_COMPRESSION_BREAKOUT';

type WindowDir = 'UP' | 'DOWN' | 'FLAT';
type Momentum = 'SUSTAINED' | 'REVERSED' | 'STALLED';
type JudasVs = 'WITH_JUDAS' | 'AGAINST_JUDAS' | 'NEUTRAL';

type AmdMomentumRow = {
  trade_date: string;
  amd_outcome_tag: string;
  judas_direction: string;
  m5_vs_judas_direction: string;
  m5_first_3_net_pips: number | string | null;
  daily_bias_alignment: string | null;
  accumulation_quality_score: number | null;
  auto_direction_confidence: string | null;
};

type M5Candle = { o: string; h: string; l: string; c: string; time?: string };

type DetailRow = {
  trade_date: string;
  outcome: string;
  judas_dir: string;
  w1_net: number;
  w1_dir: WindowDir;
  w1_vs_judas: string;
  w2_net: number;
  w2_dir: WindowDir;
  w2_vs_judas: JudasVs;
  momentum: Momentum;
  qual_score: number | null;
  alignment: string | null;
  auto_conf: string | null;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (name === 'SUPABASE_SERVICE_ROLE_KEY' && process.env.SUPABASE_SERVICE_KEY) {
    return process.env.SUPABASE_SERVICE_KEY;
  }
  throw new Error(`Missing env: ${name}`);
}

function parsePrice(raw: string): number {
  return parseFloat(raw);
}

function windowNet(open: number, close: number): number {
  return Math.round((close - open) * 10000 * 10) / 10;
}

function classifyWindowDir(netPips: number): WindowDir {
  if (netPips > 1) return 'UP';
  if (netPips < -1) return 'DOWN';
  return 'FLAT';
}

function classifyMomentum(w1Dir: WindowDir, w2Dir: WindowDir): Momentum {
  if (w1Dir === 'FLAT' || w2Dir === 'FLAT') return 'STALLED';
  if (w1Dir === w2Dir) return 'SUSTAINED';
  return 'REVERSED';
}

function computeW2VsJudas(judasDir: string, w2Dir: WindowDir): JudasVs {
  if (w2Dir === 'FLAT') return 'NEUTRAL';
  if (judasDir === 'UP' && w2Dir === 'DOWN') return 'AGAINST_JUDAS';
  if (judasDir === 'UP' && w2Dir === 'UP') return 'WITH_JUDAS';
  if (judasDir === 'DOWN' && w2Dir === 'UP') return 'AGAINST_JUDAS';
  if (judasDir === 'DOWN' && w2Dir === 'DOWN') return 'WITH_JUDAS';
  return 'NEUTRAL';
}

function isTextbook(tag: string): boolean {
  return tag === OUTCOME_TEXTBOOK;
}

function isCompression(tag: string): boolean {
  return tag === OUTCOME_COMPRESSION;
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return '—';
  return `${Math.round((numerator / denominator) * 1000) / 10}%`;
}

function dominantPct(txtCount: number, cmpCount: number, total: number): string {
  if (total === 0) return '—';
  const dominant = txtCount >= cmpCount ? txtCount : cmpCount;
  return pct(dominant, total);
}

async function loadAmdRows(supabase: SupabaseClient): Promise<AmdMomentumRow[]> {
  const { data, error } = await supabase
    .from('amd_state')
    .select(`
      trade_date, amd_outcome_tag, judas_direction,
      m5_vs_judas_direction, m5_first_3_net_pips,
      daily_bias_alignment, accumulation_quality_score,
      auto_direction_confidence
    `)
    .in('amd_outcome_tag', [OUTCOME_TEXTBOOK, OUTCOME_COMPRESSION])
    .not('m5_vs_judas_direction', 'is', null)
    .order('trade_date', { ascending: true });

  if (error || !data) {
    throw new Error(`amd_state query failed: ${error?.message ?? 'no data'}`);
  }
  return data as AmdMomentumRow[];
}

async function fetchDistributionCandles(
  supabase: SupabaseClient,
  tradeDate: string,
): Promise<M5Candle[] | null> {
  const { data: candleRow } = await supabase
    .from('amd_m5_distribution_candles')
    .select('candles, candle_count')
    .eq('trade_date', tradeDate)
    .eq('pair', PAIR)
    .eq('fetch_status', 'success')
    .single();

  if (!candleRow?.candles || !Array.isArray(candleRow.candles)) {
    return null;
  }
  return candleRow.candles as M5Candle[];
}

function computeDetailRow(
  row: AmdMomentumRow,
  candles: M5Candle[],
): DetailRow | null {
  if (candles.length < 6) return null;

  const w1Net = candles.slice(0, 3).reduce(
    (sum, c) => sum + (parseFloat(c.c) - parseFloat(c.o)), 0,
  ) * 10000;
  const w1Dir = classifyWindowDir(w1Net);

  const w2Net = candles.slice(3, 6).reduce(
    (sum, c) => sum + (parseFloat(c.c) - parseFloat(c.o)), 0,
  ) * 10000;
  const w2Dir = classifyWindowDir(w2Net);

  const storedW1 = row.m5_first_3_net_pips != null
    ? parseFloat(String(row.m5_first_3_net_pips))
    : null;
  if (storedW1 != null && Math.abs(w1Net - storedW1) > 1.0) {
    console.warn(
      `WARN: W1 mismatch on ${row.trade_date} computed=${w1Net} stored=${storedW1}`,
    );
  }

  const momentum = classifyMomentum(w1Dir, w2Dir);
  const w2VsJudas = computeW2VsJudas(row.judas_direction, w2Dir);

  return {
    trade_date: row.trade_date,
    outcome: row.amd_outcome_tag,
    judas_dir: row.judas_direction,
    w1_net: w1Net,
    w1_dir: w1Dir,
    w1_vs_judas: row.m5_vs_judas_direction,
    w2_net: w2Net,
    w2_dir: w2Dir,
    w2_vs_judas: w2VsJudas,
    momentum,
    qual_score: row.accumulation_quality_score,
    alignment: row.daily_bias_alignment,
    auto_conf: row.auto_direction_confidence,
  };
}

type Bucket = { n: number; txt: number; cmp: number };

function emptyBucket(): Bucket {
  return { n: 0, txt: 0, cmp: 0 };
}

function addToBucket(bucket: Bucket, detail: DetailRow): void {
  bucket.n += 1;
  if (isTextbook(detail.outcome)) bucket.txt += 1;
  if (isCompression(detail.outcome)) bucket.cmp += 1;
}

function printMomentumSection(momentumBuckets: Record<Momentum, Bucket>): void {
  console.log('\n=== Section 1: Momentum classification vs outcome ===\n');
  console.log('MOMENTUM TYPE    | N  | TXT | CMP | TXT%  | CMP%');
  for (const label of ['SUSTAINED', 'REVERSED', 'STALLED'] as Momentum[]) {
    const bucket = momentumBuckets[label];
    console.log(
      `${label.padEnd(16)} | ${String(bucket.n).padStart(2)} | ${String(bucket.txt).padStart(3)} | ${String(bucket.cmp).padStart(3)} | ${pct(bucket.txt, bucket.n).padStart(5)} | ${pct(bucket.cmp, bucket.n).padStart(5)}`,
    );
  }
}

function printCrossSection(crossBuckets: Record<string, Bucket>): void {
  console.log('\n=== Section 2: W1 vs Judas × momentum cross ===\n');
  console.log('W1_VS_JUDAS × MOMENTUM   | N  | TXT | CMP | dominant%');
  const keys = [
    'AGAINST_JUDAS + SUSTAINED',
    'AGAINST_JUDAS + REVERSED',
    'AGAINST_JUDAS + STALLED',
    'WITH_JUDAS + SUSTAINED',
    'WITH_JUDAS + REVERSED',
    'WITH_JUDAS + STALLED',
    'NEUTRAL + SUSTAINED',
    'NEUTRAL + REVERSED',
    'NEUTRAL + STALLED',
  ];
  for (const key of keys) {
    const bucket = crossBuckets[key] ?? emptyBucket();
    if (bucket.n === 0) continue;
    console.log(
      `${key.padEnd(24)} | ${String(bucket.n).padStart(2)} | ${String(bucket.txt).padStart(3)} | ${String(bucket.cmp).padStart(3)} | ${dominantPct(bucket.txt, bucket.cmp, bucket.n).padStart(5)}`,
    );
  }
}

function printJun3(detailRows: DetailRow[]): void {
  console.log('\n=== Section 3: Jun 3 pattern ===\n');
  const jun3 = detailRows.find((row) => row.trade_date === '2026-06-03');
  if (!jun3) {
    console.log('2026-06-03 not found in processed dataset (missing M5 candles or filtered out).');
    return;
  }
  console.log(
    `2026-06-03 | outcome=${jun3.outcome} | judas=${jun3.judas_dir} | ` +
    `W1=${jun3.w1_net}p ${jun3.w1_dir} (${jun3.w1_vs_judas}) | ` +
    `W2=${jun3.w2_net}p ${jun3.w2_dir} (${jun3.w2_vs_judas}) | momentum=${jun3.momentum} | qual=${jun3.qual_score}`,
  );
}

function printUpgradeCases(detailRows: DetailRow[]): void {
  console.log('\n=== Section 4: Key upgrade cases ===\n');
  const fakeBounce = detailRows.filter(
    (row) => row.w1_vs_judas === 'AGAINST_JUDAS' && row.momentum === 'REVERSED' && isCompression(row.outcome),
  );
  const fakeContinuation = detailRows.filter(
    (row) => row.w1_vs_judas === 'WITH_JUDAS' && row.momentum === 'REVERSED' && isTextbook(row.outcome),
  );

  console.log('W1=AGAINST_JUDAS + REVERSED → CMP (fake bounce confirmed):');
  if (fakeBounce.length === 0) console.log('  (none)');
  fakeBounce.forEach((row) => {
    console.log(`  ${row.trade_date} | W1=${row.w1_net}p W2=${row.w2_net}p | qual=${row.qual_score}`);
  });

  console.log('\nW1=WITH_JUDAS + REVERSED → TXT (fake continuation):');
  if (fakeContinuation.length === 0) console.log('  (none)');
  fakeContinuation.forEach((row) => {
    console.log(`  ${row.trade_date} | W1=${row.w1_net}p W2=${row.w2_net}p | qual=${row.qual_score}`);
  });
}

function printAccuracySection(detailRows: DetailRow[]): void {
  console.log('\n=== Section 5: W1-alone accuracy vs W1+W2 accuracy ===\n');

  const w1Against = detailRows.filter((row) => row.w1_vs_judas === 'AGAINST_JUDAS');
  const w1With = detailRows.filter((row) => row.w1_vs_judas === 'WITH_JUDAS');

  const againstSustained = w1Against.filter((row) => row.momentum === 'SUSTAINED');
  const againstReversed = w1Against.filter((row) => row.momentum === 'REVERSED');

  const withSustained = w1With.filter((row) => row.momentum === 'SUSTAINED');
  const withReversed = w1With.filter((row) => row.momentum === 'REVERSED');

  console.log(`W1 alone:   AGAINST_JUDAS → TXT ${pct(w1Against.filter(isTextbookOutcome).length, w1Against.length)} (n=${w1Against.length})`);
  console.log(`W1+W2:      AGAINST_JUDAS + SUSTAINED → TXT ${pct(againstSustained.filter(isTextbookOutcome).length, againstSustained.length)} (n=${againstSustained.length})`);
  console.log(`W1+W2:      AGAINST_JUDAS + REVERSED  → TXT ${pct(againstReversed.filter(isTextbookOutcome).length, againstReversed.length)} (n=${againstReversed.length})`);
  console.log('');
  console.log(`W1 alone:   WITH_JUDAS → CMP ${pct(w1With.filter(isCompressionOutcome).length, w1With.length)} (n=${w1With.length})`);
  console.log(`W1+W2:      WITH_JUDAS + SUSTAINED → CMP ${pct(withSustained.filter(isCompressionOutcome).length, withSustained.length)} (n=${withSustained.length})`);
  console.log(`W1+W2:      WITH_JUDAS + REVERSED  → CMP ${pct(withReversed.filter(isCompressionOutcome).length, withReversed.length)} (n=${withReversed.length})`);
}

function isTextbookOutcome(row: DetailRow): boolean {
  return isTextbook(row.outcome);
}

function isCompressionOutcome(row: DetailRow): boolean {
  return isCompression(row.outcome);
}

function writeDetailCsv(detailRows: DetailRow[], outputPath: string): void {
  const header = [
    'trade_date', 'outcome', 'judas_dir', 'w1_net', 'w1_dir', 'w1_vs_judas',
    'w2_net', 'w2_dir', 'w2_vs_judas', 'momentum', 'qual_score', 'alignment', 'auto_conf',
  ].join(',');
  const lines = detailRows.map((row) => [
    row.trade_date, row.outcome, row.judas_dir, row.w1_net, row.w1_dir, row.w1_vs_judas,
    row.w2_net, row.w2_dir, row.w2_vs_judas, row.momentum,
    row.qual_score ?? '', row.alignment ?? '', row.auto_conf ?? '',
  ].join(','));
  fs.writeFileSync(outputPath, [header, ...lines].join('\n') + '\n');
}

async function main(): Promise<void> {
  const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const amdRows = await loadAmdRows(supabase);
  console.log(`Loaded ${amdRows.length} amd_state rows (TEXTBOOK + COMPRESSION, M5 populated)`);

  const detailRows: DetailRow[] = [];
  let skippedNoCandles = 0;

  for (const row of amdRows) {
    const candles = await fetchDistributionCandles(supabase, row.trade_date);
    if (!candles) {
      skippedNoCandles += 1;
      continue;
    }
    const detail = computeDetailRow(row, candles);
    if (!detail) {
      skippedNoCandles += 1;
      continue;
    }
    detailRows.push(detail);
  }

  console.log(`Processed ${detailRows.length} rows | Skipped (no/short candles): ${skippedNoCandles}`);

  const momentumBuckets: Record<Momentum, Bucket> = {
    SUSTAINED: emptyBucket(),
    REVERSED: emptyBucket(),
    STALLED: emptyBucket(),
  };
  const crossBuckets: Record<string, Bucket> = {};

  for (const detail of detailRows) {
    addToBucket(momentumBuckets[detail.momentum], detail);
    const crossKey = `${detail.w1_vs_judas} + ${detail.momentum}`;
    if (!crossBuckets[crossKey]) crossBuckets[crossKey] = emptyBucket();
    addToBucket(crossBuckets[crossKey], detail);
  }

  printMomentumSection(momentumBuckets);
  printCrossSection(crossBuckets);
  printJun3(detailRows);
  printUpgradeCases(detailRows);
  printAccuracySection(detailRows);

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outputPath = path.join(process.cwd(), 'scripts/output', `amd_m5_momentum_backtest_${stamp}.csv`);
  writeDetailCsv(detailRows, outputPath);
  console.log(`\nDetail CSV: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
