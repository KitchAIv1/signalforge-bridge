/**
 * Read-only: investigate 2026-06-01 reconstruction vs live 10:31 observation.
 * Run: npx tsx scripts/investigateToday1031.ts
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { fetchCompletedCandles } from '../src/connectors/oanda.js';
import { computeAutoDirectionSnapshot } from '../src/services/amdDetector/amdAutoDirection.js';
import {
  computeDateFeatures,
  type OhlcCandle,
} from '../src/services/amdDetector/amdFeatures.js';
import { applyAsianCloseAdvisory } from '../src/services/amdDetector/asianCloseAdvisory.js';
import { filterH1CandlesBeforeDistribution } from './decisionDirectionBackfill/filterH1At1031.js';
import { amdH1FetchWindow, amdM5FetchWindow, d1BiasFetchWindow } from './decisionDirectionBackfill/fetchWindows.js';
import { buildDailyBiasSnapshot } from './decisionDirectionBackfill/dailyBiasSnapshot.js';
import { fetchM5SignalAt1031 } from './decisionDirectionBackfill/m5SignalAt1031.js';

const TRADE_DATE = '2026-06-01';
const PAIR = 'AUD_USD';

function fmtBar(c: { time: string; mid: { o: string; h: string; l: string; c: string }; complete?: boolean }) {
  const h = new Date(c.time).getUTCHours();
  return `${c.time} utc_h=${h} o=${c.mid.o} h=${c.mid.h} l=${c.mid.l} c=${c.mid.c} complete=${c.complete ?? 'n/a'}`;
}

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!,
  );

  const { data: dbRow } = await supabase
    .from('amd_state')
    .select('*')
    .eq('pair', PAIR)
    .eq('trade_date', TRADE_DATE)
    .maybeSingle();

  console.log('\n=== amd_state DB row (current) ===');
  console.log(JSON.stringify({
    auto_direction: dbRow?.auto_direction,
    decision_auto_direction: dbRow?.decision_auto_direction,
    amd_tag: dbRow?.amd_tag,
    judas_direction: dbRow?.judas_direction,
    judas_pips: dbRow?.judas_pips,
    layer4_d1_bias: dbRow?.layer4_d1_bias,
    layer4_bullish_count: dbRow?.layer4_bullish_count,
    layer4_bearish_count: dbRow?.layer4_bearish_count,
    daily_bias_alignment: dbRow?.daily_bias_alignment,
    asian_close_bias_signal: dbRow?.asian_close_bias_signal,
    asian_close_position_pct: dbRow?.asian_close_position_pct,
    m5_vs_judas_direction: dbRow?.m5_vs_judas_direction,
    reversal_confirmed: dbRow?.reversal_confirmed,
    evaluated_at: dbRow?.evaluated_at,
    decision_evaluated_at: dbRow?.decision_evaluated_at,
    auto_direction_reason: dbRow?.auto_direction_reason,
  }, null, 2));

  const h1Win = amdH1FetchWindow(TRADE_DATE);
  console.log('\n=== H1 fetch ===');
  console.log(`from=${h1Win.fromISO} to=${h1Win.toISO}`);

  const h1Raw = await fetchCompletedCandles(PAIR, 'H1', h1Win.fromISO, h1Win.toISO);
  console.log(`\nH1 raw count: ${h1Raw.length}`);
  for (const c of h1Raw) console.log('  RAW  ' + fmtBar(c));

  const h1Filtered = filterH1CandlesBeforeDistribution(h1Raw as OhlcCandle[]);
  console.log(`\nH1 after hour<10 filter: ${h1Filtered.length}`);
  for (const c of h1Filtered) console.log('  KEEP ' + fmtBar(c));

  const hour10InRaw = h1Raw.filter((c) => new Date(c.time).getUTCHours() >= 10);
  console.log(`\nHour>=10 in raw (should exist in historical fetch): ${hour10InRaw.length}`);
  for (const c of hour10InRaw) console.log('  DROP ' + fmtBar(c));

  const d1Win = d1BiasFetchWindow(TRADE_DATE);
  console.log('\n=== D1 fetch ===');
  console.log(`from=${d1Win.fromISO} to=${d1Win.toISO}`);

  const d1All = await fetchCompletedCandles(PAIR, 'D', d1Win.fromISO, d1Win.toISO);
  console.log(`D1 total bars: ${d1All.length}`);
  const d1Last7 = d1All.slice(-7);
  console.log('\nLast 7 D1 bars:');
  for (const c of d1Last7) {
    const open = parseFloat(c.mid.o);
    const close = parseFloat(c.mid.c);
    const vote = close > open ? 'BULL' : close < open ? 'BEAR' : 'DOJI';
    console.log('  ' + fmtBar(c) + ` vote=${vote}`);
  }

  const june1D1 = d1All.filter((c) => c.time.startsWith('2026-06-01'));
  console.log(`\nJune 1 D1 bar in fetch result: ${june1D1.length}`);
  for (const c of june1D1) console.log('  JUNE1 ' + fmtBar(c));

  const features = computeDateFeatures(h1Filtered, () => {});
  const dailyBias = await buildDailyBiasSnapshot(TRADE_DATE, features.judas_direction);
  const m5Signal = await fetchM5SignalAt1031(TRADE_DATE, features.judas_direction);

  console.log('\n=== Features ===');
  console.log(JSON.stringify({
    amd_tag: features.amd_tag,
    judas_direction: features.judas_direction,
    judas_pips: features.judas_pips,
    asian_range_pips: features.asian_range_pips,
    asian_is_flat: features.asian_is_flat,
    reversal_confirmed: features.reversal_confirmed,
    compression_breakout: features.compression_breakout,
    asian_close_bias_signal: features.asian_close_bias_signal,
    asian_close_position_pct: features.asian_close_position_pct,
  }, null, 2));

  console.log('\n=== D1 bias (reconstructed) ===');
  console.log(JSON.stringify(dailyBias, null, 2));

  console.log('\n=== M5 signal ===');
  console.log(JSON.stringify(m5Signal, null, 2));

  const m5Win = amdM5FetchWindow(TRADE_DATE);
  const m5Raw = await fetchCompletedCandles(PAIR, 'M5', m5Win.fromISO, m5Win.toISO);
  console.log(`\nM5 bars (${m5Win.fromISO} → ${m5Win.toISO}): ${m5Raw.length}`);
  for (const c of m5Raw) console.log('  ' + fmtBar(c));

  let autoDir = computeAutoDirectionSnapshot(
    features.amd_tag,
    features.judas_direction,
    dailyBias.layer4_d1_bias,
    dailyBias.layer4_bullish_count,
    dailyBias.layer4_bearish_count,
    dailyBias.layer4_bullish_count_7,
    dailyBias.layer4_bearish_count_7,
    dailyBias.daily_bias_alignment,
    features.reversal_confirmed,
    features.judas_pips,
    m5Signal.m5_vs_judas_direction,
    features.asian_range_pips,
    features.asian_net_pips,
  );

  console.log('\n=== auto BEFORE asianCloseAdvisory ===');
  console.log(JSON.stringify(autoDir, null, 2));

  autoDir = applyAsianCloseAdvisory(
    autoDir,
    features.asian_close_bias_signal ?? null,
    features.asian_close_position_pct ?? null,
  );

  console.log('\n=== auto AFTER asianCloseAdvisory ===');
  console.log(JSON.stringify(autoDir, null, 2));

  console.log('\n=== Branch trace (AMD_FAILED) ===');
  const tag = features.amd_tag;
  const judasPips = features.judas_pips;
  const m5 = m5Signal.m5_vs_judas_direction;
  const d1 = dailyBias.layer4_d1_bias;
  const align = dailyBias.daily_bias_alignment;
  if (tag === 'AMD_FAILED') {
    const m5Layer =
      judasPips !== null && judasPips >= 8 && m5 !== null &&
      (d1 === 'RANGING' || d1 === null);
    console.log(`M5 layer eligible (judas>=8, RANGING D1): ${m5Layer}`);
    console.log(`  judas_pips=${judasPips} m5=${m5} d1=${d1}`);
    if (!m5Layer) {
      console.log(`D1 branch: layer4_d1_bias=${d1} → direction=${d1 === 'TRENDING_UP' ? 'long' : d1 === 'TRENDING_DOWN' ? 'short' : 'neutral'}`);
      console.log(`  alignment=${align} → confidence/multiplier from ALIGNED/CONFLICTED path`);
    }
  }

  console.log('\n=== Comparison table ===');
  const live = {
    amd_tag: 'AMD_FAILED',
    judas_direction: 'UP',
    judas_pips: 6,
    layer4_d1_bias: 'TRENDING_UP',
    layer4_bullish_count: 3,
    layer4_bearish_count: 2,
    asian_close_bias: 'BEARISH',
    asian_close_pct: 27.6,
    m5_vs_judas: 'AGAINST_JUDAS',
    auto_direction: 'long',
  };
  const recon = {
    amd_tag: features.amd_tag,
    judas_direction: features.judas_direction,
    judas_pips: features.judas_pips,
    layer4_d1_bias: dailyBias.layer4_d1_bias,
    layer4_bullish_count: dailyBias.layer4_bullish_count,
    layer4_bearish_count: dailyBias.layer4_bearish_count,
    asian_close_bias: features.asian_close_bias_signal,
    asian_close_pct: features.asian_close_position_pct,
    m5_vs_judas: m5Signal.m5_vs_judas_direction,
    auto_direction: autoDir.auto_direction,
  };
  console.log('Field                  | Live 10:31      | Reconstruction');
  console.log('-----------------------|-----------------|----------------');
  for (const key of Object.keys(live) as (keyof typeof live)[]) {
    const l = String(live[key]);
    const r = String(recon[key as keyof typeof recon] ?? 'null');
    const mark = l === r ? '' : ' *** MISMATCH';
    console.log(`${key.padEnd(22)} | ${l.padEnd(15)} | ${r}${mark}`);
  }
}

void main().catch(console.error);
