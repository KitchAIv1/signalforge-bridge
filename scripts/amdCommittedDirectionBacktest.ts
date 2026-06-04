/**
 * Committed direction backtest — 10 predictor features vs 10:30–13:00 window.
 * READ-ONLY research — reads amd_m5_distribution_candles + amd_state.
 *
 * Run: npx ts-node -P tsconfig.amd-tc-backtest.json scripts/amdCommittedDirectionBacktest.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const PAIR = 'AUD_USD';
const FEATURE_KEYS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10'] as const;
type FeatureKey = typeof FEATURE_KEYS[number];
type Dir = 'UP' | 'DOWN' | 'FLAT';
type M5RawCandle = { o: string; h: string; l: string; c: string; time?: string };

type CommittedResult = {
  net_pips: number;
  dirA: Dir;
  dirB: Dir;
  totalUp: number;
  totalDown: number;
  agree: boolean;
};

type StateRow = {
  trade_date: string;
  amd_outcome_tag: string;
  amd_tag: string | null;
  judas_direction: string | null;
  judas_pips: number | null;
  decision_auto_direction: string | null;
  auto_direction_confidence: string | null;
  m5_vs_judas_direction: string | null;
  m5_momentum_type: string | null;
  m5_w2_net_pips: number | null;
  daily_bias_alignment: string | null;
  layer4_d1_bias: string | null;
  layer4_bullish_count: number | null;
  asian_close_position_pct: number | null;
  asian_close_bias_signal: string | null;
  asian_net_direction: string | null;
  accumulation_quality_score: number | null;
};

type FeaturePredictions = Record<FeatureKey, Dir | null>;

type DayRow = {
  trade_date: string;
  amd_outcome_tag: string;
  amd_tag: string | null;
  judas_direction: string | null;
  committed: CommittedResult;
  features: FeaturePredictions;
  signals_agree_count: number;
  signals_agree_direction: Dir | null;
};

type FeatureStats = {
  key: FeatureKey;
  label: string;
  n_signal: number;
  signal_rate: number;
  acc_A: number;
  acc_B: number;
  acc_agree: number;
  avg_net_pips_correct: number;
  avg_net_pips_wrong: number;
};

const FEATURE_LABELS: Record<FeatureKey, string> = {
  f1: 'Judas inversion',
  f2: 'System verdict',
  f3: 'M5 W1 signal',
  f4: 'W1+W2 momentum',
  f5: 'Asian close pct',
  f6: 'Asian close bias',
  f7: 'D1 macro bias',
  f8: 'Alignment×Judas',
  f9: 'W2 net pips',
  f10: 'HIGH conf only',
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (name === 'SUPABASE_SERVICE_ROLE_KEY' && process.env.SUPABASE_SERVICE_KEY) {
    return process.env.SUPABASE_SERVICE_KEY;
  }
  throw new Error(`Missing env: ${name}`);
}

function computeCommittedDirection(candles: M5RawCandle[]): CommittedResult | null {
  const window = candles.slice(6, 36);
  if (window.length < 30) return null;

  const open1030 = parseFloat(window[0].o);
  const close1300 = parseFloat(window[window.length - 1].c);
  const net_pips = Math.round((close1300 - open1030) * 10000 * 10) / 10;
  const dirA: Dir = net_pips > 1 ? 'UP' : net_pips < -1 ? 'DOWN' : 'FLAT';

  const slots = [
    window.slice(0, 6),
    window.slice(6, 12),
    window.slice(12, 18),
    window.slice(18, 24),
    window.slice(24, 30),
  ];

  let totalUp = 0;
  let totalDown = 0;
  for (const slot of slots) {
    const slotOpen = parseFloat(slot[0].o);
    const slotHigh = Math.max(...slot.map((c) => parseFloat(c.h)));
    const slotLow = Math.min(...slot.map((c) => parseFloat(c.l)));
    totalUp += (slotHigh - slotOpen) * 10000;
    totalDown += (slotOpen - slotLow) * 10000;
  }
  const dirB: Dir = totalUp > totalDown ? 'UP' : totalDown > totalUp ? 'DOWN' : 'FLAT';

  return {
    net_pips,
    dirA,
    dirB,
    totalUp: Math.round(totalUp * 10) / 10,
    totalDown: Math.round(totalDown * 10) / 10,
    agree: dirA === dirB,
  };
}

function judasInverted(judasDir: string | null): Dir | null {
  if (judasDir === 'UP') return 'DOWN';
  if (judasDir === 'DOWN') return 'UP';
  return null;
}

function computeFeatures(state: StateRow): FeaturePredictions {
  const judasDir = state.judas_direction;
  const decisionAutoDir = state.decision_auto_direction;
  const m5Signal = state.m5_vs_judas_direction;
  const momentum = state.m5_momentum_type;
  const asianClosePct = state.asian_close_position_pct;
  const asianCloseBias = state.asian_close_bias_signal;
  const d1Bias = state.layer4_d1_bias;
  const alignment = state.daily_bias_alignment;
  const w2NetPips = state.m5_w2_net_pips;
  const autoConf = state.auto_direction_confidence;

  const f1 = judasInverted(judasDir);
  const f2 = decisionAutoDir === 'long' ? 'UP'
    : decisionAutoDir === 'short' ? 'DOWN' : null;
  const f3 = m5Signal === 'AGAINST_JUDAS' ? judasInverted(judasDir)
    : m5Signal === 'WITH_JUDAS' ? (judasDir === 'UP' ? 'UP' : judasDir === 'DOWN' ? 'DOWN' : null)
    : null;
  const f4 =
    m5Signal === 'AGAINST_JUDAS' && momentum === 'SUSTAINED' ? judasInverted(judasDir) :
    m5Signal === 'WITH_JUDAS' && momentum === 'SUSTAINED'
      ? (judasDir === 'UP' ? 'UP' : judasDir === 'DOWN' ? 'DOWN' : null) :
    m5Signal === 'AGAINST_JUDAS' && momentum === 'REVERSED'
      ? (judasDir === 'UP' ? 'UP' : judasDir === 'DOWN' ? 'DOWN' : null) :
    null;
  const f5 = asianClosePct != null
    ? asianClosePct < 35 ? 'UP' : asianClosePct > 65 ? 'DOWN' : null
    : null;
  const f6 = asianCloseBias === 'BEARISH' ? 'UP'
    : asianCloseBias === 'BULLISH' ? 'DOWN' : null;
  const f7 = d1Bias === 'TRENDING_UP' ? 'UP'
    : d1Bias === 'TRENDING_DOWN' ? 'DOWN' : null;
  const f8 = alignment === 'ALIGNED' ? f1
    : alignment === 'CONFLICTED' ? f7
    : null;
  const f9 = w2NetPips != null
    ? w2NetPips > 1 ? 'UP' : w2NetPips < -1 ? 'DOWN' : null
    : null;
  const f10 = autoConf === 'high' ? f2 : null;

  return { f1, f2, f3, f4, f5, f6, f7, f8, f9, f10 };
}

function accuracy(prediction: Dir | null, actual: Dir): boolean | null {
  if (!prediction || actual === 'FLAT') return null;
  return prediction === actual;
}

function comboSignal(features: FeaturePredictions): { count: number; direction: Dir | null } {
  const preds = FEATURE_KEYS.map((key) => features[key]).filter(
    (pred): pred is 'UP' | 'DOWN' => pred === 'UP' || pred === 'DOWN',
  );
  const upCount = preds.filter((pred) => pred === 'UP').length;
  const downCount = preds.filter((pred) => pred === 'DOWN').length;
  if (upCount >= downCount && upCount >= 3) return { count: upCount, direction: 'UP' };
  if (downCount > upCount && downCount >= 3) return { count: downCount, direction: 'DOWN' };
  return { count: Math.max(upCount, downCount), direction: null };
}

function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function computeFeatureStats(rows: DayRow[], key: FeatureKey, totalDays: number): FeatureStats {
  let nSignal = 0;
  let correctA = 0;
  let scorableA = 0;
  let correctB = 0;
  let scorableB = 0;
  let correctAgree = 0;
  let scorableAgree = 0;
  const netCorrect: number[] = [];
  const netWrong: number[] = [];

  for (const row of rows) {
    const pred = row.features[key];
    if (pred !== 'UP' && pred !== 'DOWN') continue;
    nSignal += 1;

    const resultA = accuracy(pred, row.committed.dirA);
    if (resultA !== null) {
      scorableA += 1;
      if (resultA) {
        correctA += 1;
        netCorrect.push(Math.abs(row.committed.net_pips));
      } else {
        netWrong.push(Math.abs(row.committed.net_pips));
      }
    }

    const resultB = accuracy(pred, row.committed.dirB);
    if (resultB !== null) {
      scorableB += 1;
      if (resultB) correctB += 1;
    }

    if (row.committed.agree && row.committed.dirA !== 'FLAT') {
      scorableAgree += 1;
      if (pred === row.committed.dirA) correctAgree += 1;
    }
  }

  return {
    key,
    label: FEATURE_LABELS[key],
    n_signal: nSignal,
    signal_rate: pct(nSignal, totalDays),
    acc_A: pct(correctA, scorableA),
    acc_B: pct(correctB, scorableB),
    acc_agree: pct(correctAgree, scorableAgree),
    avg_net_pips_correct: avg(netCorrect),
    avg_net_pips_wrong: avg(netWrong),
  };
}

function computeComboStats(rows: DayRow[], minAgree: number): {
  n: number; acc_A: number; acc_B: number; acc_agree: number;
} {
  let n = 0;
  let correctA = 0;
  let scorableA = 0;
  let correctB = 0;
  let scorableB = 0;
  let correctAgree = 0;
  let scorableAgree = 0;

  for (const row of rows) {
    const upCount = FEATURE_KEYS.filter((key) => row.features[key] === 'UP').length;
    const downCount = FEATURE_KEYS.filter((key) => row.features[key] === 'DOWN').length;
    let direction: Dir | null = null;
    if (upCount >= minAgree && upCount >= downCount) direction = 'UP';
    else if (downCount >= minAgree && downCount > upCount) direction = 'DOWN';
    if (!direction) continue;

    n += 1;
    const resultA = accuracy(direction, row.committed.dirA);
    if (resultA !== null) {
      scorableA += 1;
      if (resultA) correctA += 1;
    }
    const resultB = accuracy(direction, row.committed.dirB);
    if (resultB !== null) {
      scorableB += 1;
      if (resultB) correctB += 1;
    }
    if (row.committed.agree && row.committed.dirA !== 'FLAT') {
      scorableAgree += 1;
      if (direction === row.committed.dirA) correctAgree += 1;
    }
  }

  return {
    n,
    acc_A: pct(correctA, scorableA),
    acc_B: pct(correctB, scorableB),
    acc_agree: pct(correctAgree, scorableAgree),
  };
}

function bestFeatureForTag(rows: DayRow[], tag: string): { key: FeatureKey; acc: number; n: number } {
  const tagRows = rows.filter((row) => row.amd_tag === tag);
  let best: { key: FeatureKey; acc: number; n: number } = { key: 'f1', acc: 0, n: 0 };
  for (const key of FEATURE_KEYS) {
    const stats = computeFeatureStats(tagRows, key, tagRows.length);
    if (stats.n_signal > 0 && stats.acc_A >= best.acc) {
      best = { key, acc: stats.acc_A, n: stats.n_signal };
    }
  }
  return best;
}

function writeDetailCsv(rows: DayRow[], outputPath: string): void {
  const header = [
    'trade_date', 'amd_outcome_tag', 'judas_direction',
    'net_pips', 'dirA', 'dirB', 'totalUp', 'totalDown', 'AB_agree',
    'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10',
    'f1_correct_A', 'f2_correct_A', 'f3_correct_A', 'f4_correct_A', 'f5_correct_A',
    'f6_correct_A', 'f7_correct_A', 'f8_correct_A', 'f9_correct_A', 'f10_correct_A',
    'signals_agree_count', 'signals_agree_direction', 'combo_correct_A',
  ].join(',');

  const lines = rows.map((row) => {
    const combo = comboSignal(row.features);
    const comboCorrect = combo.direction != null
      ? accuracy(combo.direction, row.committed.dirA)
      : null;
    const correctCols = FEATURE_KEYS.map((key) =>
      accuracy(row.features[key], row.committed.dirA) ?? '',
    );
    return [
      row.trade_date, row.amd_outcome_tag, row.judas_direction ?? '',
      row.committed.net_pips, row.committed.dirA, row.committed.dirB,
      row.committed.totalUp, row.committed.totalDown, row.committed.agree,
      ...FEATURE_KEYS.map((key) => row.features[key] ?? ''),
      ...correctCols,
      row.signals_agree_count, row.signals_agree_direction ?? '', comboCorrect ?? '',
    ].join(',');
  });

  fs.writeFileSync(outputPath, [header, ...lines].join('\n') + '\n');
}

async function main(): Promise<void> {
  const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

  const { data: candleRows, error: candleErr } = await supabase
    .from('amd_m5_distribution_candles')
    .select('trade_date, candles, candle_count')
    .eq('pair', PAIR)
    .eq('fetch_status', 'success')
    .order('trade_date', { ascending: true });

  if (candleErr || !candleRows) {
    throw new Error(`M5 fetch failed: ${candleErr?.message ?? 'no data'}`);
  }

  const { data: stateRows, error: stateErr } = await supabase
    .from('amd_state')
    .select(`
      trade_date, amd_outcome_tag, amd_tag,
      judas_direction, judas_pips,
      decision_auto_direction, auto_direction_confidence,
      m5_vs_judas_direction, m5_momentum_type, m5_w2_net_pips,
      daily_bias_alignment, layer4_d1_bias, layer4_bullish_count,
      asian_close_position_pct, asian_close_bias_signal,
      asian_net_direction, accumulation_quality_score
    `)
    .eq('pair', PAIR)
    .not('amd_outcome_tag', 'is', null);

  if (stateErr || !stateRows) {
    throw new Error(`amd_state fetch failed: ${stateErr?.message ?? 'no data'}`);
  }

  const candleByDate = new Map<string, M5RawCandle[]>();
  for (const candleRow of candleRows) {
    const tradeDate = candleRow.trade_date as string;
    const candleCount = candleRow.candle_count as number;
    const candles = candleRow.candles as M5RawCandle[];
    if (candleCount >= 60 && candles && candles.length >= 72) {
      candleByDate.set(tradeDate, candles);
    }
  }

  const dayRows: DayRow[] = [];
  let skipped = 0;

  for (const rawState of stateRows as StateRow[]) {
    const candles = candleByDate.get(rawState.trade_date);
    if (!candles) {
      skipped += 1;
      continue;
    }
    const committed = computeCommittedDirection(candles);
    if (!committed) {
      skipped += 1;
      continue;
    }
    const features = computeFeatures(rawState);
    const combo = comboSignal(features);
    dayRows.push({
      trade_date: rawState.trade_date,
      amd_outcome_tag: rawState.amd_outcome_tag,
      amd_tag: rawState.amd_tag,
      judas_direction: rawState.judas_direction,
      committed,
      features,
      signals_agree_count: combo.count,
      signals_agree_direction: combo.direction,
    });
  }

  const totalDays = dayRows.length;
  const dirACounts = { UP: 0, DOWN: 0, FLAT: 0 };
  const dirBCounts = { UP: 0, DOWN: 0, FLAT: 0 };
  let abAgreeCount = 0;
  let agreeUp = 0;
  let agreeDown = 0;

  for (const row of dayRows) {
    dirACounts[row.committed.dirA] += 1;
    dirBCounts[row.committed.dirB] += 1;
    if (row.committed.agree) {
      abAgreeCount += 1;
      if (row.committed.dirA === 'UP') agreeUp += 1;
      if (row.committed.dirA === 'DOWN') agreeDown += 1;
    }
  }

  const allStats = FEATURE_KEYS.map((key) =>
    computeFeatureStats(dayRows, key, totalDays),
  ).sort((a, b) => b.acc_A - a.acc_A);

  const combo3 = computeComboStats(dayRows, 3);
  const combo5 = computeComboStats(dayRows, 5);
  const agreeDays = dayRows.filter((row) => row.committed.agree && row.committed.dirA !== 'FLAT');
  const agreeStats = FEATURE_KEYS.map((key) =>
    computeFeatureStats(agreeDays, key, agreeDays.length),
  ).sort((a, b) => b.acc_A - a.acc_A);

  console.log('=== COMMITTED DIRECTION BACKTEST ===');
  console.log(`${totalDays} days | Window: 10:30-13:00 UTC | AUDUSD M5`);
  console.log('\n── COMMITTED DIRECTION DISTRIBUTION ──');
  console.log(
    `Option A (net close):   UP=${dirACounts.UP} (${pct(dirACounts.UP, totalDays)}%) | ` +
    `DOWN=${dirACounts.DOWN} (${pct(dirACounts.DOWN, totalDays)}%) | ` +
    `FLAT=${dirACounts.FLAT} (${pct(dirACounts.FLAT, totalDays)}%)`,
  );
  console.log(
    `Option B (dominant):    UP=${dirBCounts.UP} (${pct(dirBCounts.UP, totalDays)}%) | ` +
    `DOWN=${dirBCounts.DOWN} (${pct(dirBCounts.DOWN, totalDays)}%)`,
  );
  console.log(`A and B agree:          ${abAgreeCount} days (${pct(abAgreeCount, totalDays)}%)`);
  console.log(`When agree → UP:        ${agreeUp} days | When agree → DOWN: ${agreeDown} days`);

  console.log('\n── FEATURE ACCURACY RANKING ──');
  console.log('Feature              | N_sig | SigRate | AccA  | AccB  | AccAgree | AvgPips✓ | AvgPips✗');
  for (const stats of allStats) {
    const num = stats.key.replace('f', '');
    console.log(
      `F${num.padStart(2, ' ')} ${stats.label.padEnd(17)} | ` +
      `${String(stats.n_signal).padStart(5)} | ${String(stats.signal_rate).padStart(5)}% | ` +
      `${String(stats.acc_A).padStart(4)}% | ${String(stats.acc_B).padStart(4)}% | ` +
      `${String(stats.acc_agree).padStart(7)}% | ${String(stats.avg_net_pips_correct).padStart(7)} | ` +
      `${String(stats.avg_net_pips_wrong).padStart(7)}`,
    );
  }

  console.log('\n── COMBINATION FILTER ──');
  console.log(
    `3+ features agree:   N=${combo3.n} | AccA=${combo3.acc_A}% | ` +
    `AccB=${combo3.acc_B}% | AccAgree=${combo3.acc_agree}%`,
  );
  console.log(
    `5+ features agree:   N=${combo5.n} | AccA=${combo5.acc_A}% | ` +
    `AccB=${combo5.acc_B}% | AccAgree=${combo5.acc_agree}%`,
  );

  console.log('\n── BY AMD TAG (live amd_tag at 10:31) ──');
  console.log('Best feature per tag for Option A accuracy:');
  for (const tag of ['AMD_FAILED', 'AMD_SHIFTED', 'AMD_NONE']) {
    const shortTag = tag.replace('AMD_', '');
    const best = bestFeatureForTag(dayRows, tag);
    console.log(
      `  ${shortTag.padEnd(11)}: F${best.key.replace('f', '')} ${FEATURE_LABELS[best.key]} at ${best.acc}% (n=${best.n})`,
    );
  }

  const bestA = allStats[0];
  const bestB = [...allStats].sort((a, b) => b.acc_B - a.acc_B)[0];
  const bestAgree = agreeStats[0];

  console.log('\n── KEY FINDINGS ──');
  console.log(
    `Best single feature (Option A): F${bestA.key.replace('f', '')} ${bestA.label} at ${bestA.acc_A}% accuracy (n=${bestA.n_signal})`,
  );
  console.log(
    `Best single feature (Option B): F${bestB.key.replace('f', '')} ${bestB.label} at ${bestB.acc_B}% accuracy (n=${bestB.n_signal})`,
  );
  console.log(
    `Best combination: 3+ agree at ${combo3.acc_A}% (n=${combo3.n})`,
  );
  console.log(`A vs B agreement rate: ${pct(abAgreeCount, totalDays)}% of days`);
  console.log(
    `On agree days — best feature: F${bestAgree.key.replace('f', '')} ${bestAgree.label} at ${bestAgree.acc_A}%`,
  );

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outputPath = path.join(
    process.cwd(),
    'scripts/output',
    `amd_committed_direction_${stamp}.csv`,
  );
  writeDetailCsv(dayRows, outputPath);
  console.log(`\nDetail CSV: ${outputPath}`);
  console.log(`Skipped (no candles): ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
