/**
 * First candle direction backtest — continuation vs fade, 3 signal variants, 4 exits.
 * READ-ONLY research — reads amd_m5_distribution_candles + amd_state.
 *
 * Run: npx ts-node -P tsconfig.amd-tc-backtest.json scripts/amdFirstCandleDirectionBacktest.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const PAIR = 'AUD_USD';
const VARIANTS = ['A', 'B', 'C'] as const;
type VariantKey = typeof VARIANTS[number];
type Dir = 'UP' | 'DOWN';

type M5RawCandle = { o: string; h: string; l: string; c: string; time?: string };

type ExitResult = {
  cont_pips: number;
  fade_pips: number;
  cont_win: boolean;
  fade_win: boolean;
  mfe_cont: number;
  mfe_fade: number;
};

type DayRow = {
  trade_date: string;
  amd_tag: string | null;
  amd_outcome_tag: string;
  judas_direction: string | null;
  daily_bias_alignment: string | null;
  day_of_week: string;
  signal_A: Dir | null;
  signal_B: Dir | null;
  signal_C: Dir | null;
  first_candle_net_pips: number;
  first_candle_body_ratio: number;
  agrees_judas_inversion: boolean | null;
  exitsByVariant: Partial<Record<VariantKey, Record<string, ExitResult>>>;
};

type StateRow = {
  trade_date: string;
  amd_tag: string | null;
  amd_outcome_tag: string;
  judas_direction: string | null;
  daily_bias_alignment: string | null;
};

const EXITS = [
  { label: '11:30', endIdx: 18 },
  { label: '12:00', endIdx: 24 },
  { label: '12:30', endIdx: 30 },
  { label: '13:00', endIdx: 36 },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (name === 'SUPABASE_SERVICE_ROLE_KEY' && process.env.SUPABASE_SERVICE_KEY) {
    return process.env.SUPABASE_SERVICE_KEY;
  }
  throw new Error(`Missing env: ${name}`);
}

function dayOfWeek(tradeDate: string): string {
  const [year, month, day] = tradeDate.split('-').map(Number);
  return DAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

function judasInversion(judasDir: string | null): Dir | null {
  if (judasDir === 'UP') return 'DOWN';
  if (judasDir === 'DOWN') return 'UP';
  return null;
}

function computeSignals(candles: M5RawCandle[]): {
  net1030: number;
  bodyRatio: number;
  sigA: Dir | null;
  sigB: Dir | null;
  sigC: Dir | null;
} | null {
  const firstWindow = candles.slice(6, 12);
  if (firstWindow.length < 6) return null;

  const open1030 = parseFloat(firstWindow[0].o);
  const close1100 = parseFloat(firstWindow[firstWindow.length - 1].c);
  const high = Math.max(...firstWindow.map((c) => parseFloat(c.h)));
  const low = Math.min(...firstWindow.map((c) => parseFloat(c.l)));

  const net1030 = Math.round((close1100 - open1030) * 10000 * 10) / 10;
  const up1030 = Math.round((high - open1030) * 10000 * 10) / 10;
  const down1030 = Math.round((open1030 - low) * 10000 * 10) / 10;
  const body = Math.abs(net1030);
  const range = up1030 + down1030;
  const bodyRatio = range > 0 ? Math.round((body / range) * 1000) / 1000 : 0;

  const sigA = net1030 > 1 ? 'UP' : net1030 < -1 ? 'DOWN' : null;
  const sigB = net1030 > 2 ? 'UP' : net1030 < -2 ? 'DOWN' : null;
  const sigC = bodyRatio >= 0.5 && net1030 > 1 ? 'UP'
    : bodyRatio >= 0.5 && net1030 < -1 ? 'DOWN'
    : null;

  return { net1030, bodyRatio, sigA, sigB, sigC };
}

function computeExitOutcomes(
  candles: M5RawCandle[],
  signal: Dir,
  endIdx: number,
): ExitResult | null {
  if (candles.length < endIdx) return null;

  const entry = parseFloat(candles[12].o);
  const exitClose = parseFloat(candles[endIdx - 1].c);
  const netFromEntry = Math.round((exitClose - entry) * 10000 * 10) / 10;
  const contPips = signal === 'UP' ? netFromEntry : -netFromEntry;
  const fadePips = -contPips;

  const window = candles.slice(12, endIdx);
  const high = Math.max(...window.map((c) => parseFloat(c.h)));
  const low = Math.min(...window.map((c) => parseFloat(c.l)));
  const mfeCont = signal === 'UP'
    ? Math.round((high - entry) * 10000 * 10) / 10
    : Math.round((entry - low) * 10000 * 10) / 10;
  const mfeFade = signal === 'UP'
    ? Math.round((entry - low) * 10000 * 10) / 10
    : Math.round((high - entry) * 10000 * 10) / 10;

  return {
    cont_pips: contPips,
    fade_pips: fadePips,
    cont_win: contPips > 0,
    fade_win: fadePips > 0,
    mfe_cont: mfeCont,
    mfe_fade: mfeFade,
  };
}

function buildVariantExits(
  candles: M5RawCandle[],
  signal: Dir,
): Record<string, ExitResult> {
  const exits: Record<string, ExitResult> = {};
  for (const exitDef of EXITS) {
    const outcome = computeExitOutcomes(candles, signal, exitDef.endIdx);
    if (outcome) exits[exitDef.label] = outcome;
  }
  return exits;
}
function signalForVariant(row: DayRow, variant: VariantKey): Dir | null {
  if (variant === 'A') return row.signal_A;
  if (variant === 'B') return row.signal_B;
  return row.signal_C;
}

function variantExits(row: DayRow, variant: VariantKey): Record<string, ExitResult> | undefined {
  return row.exitsByVariant[variant];
}

function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function variantExitStats(
  rows: DayRow[],
  variant: VariantKey,
  exitLabel: string,
): { n: number; contWinPct: number; contAvg: number; fadeWinPct: number; fadeAvg: number } {
  const active = rows.filter((row) => signalForVariant(row, variant) != null);
  const outcomes = active
    .map((row) => variantExits(row, variant)?.[exitLabel])
    .filter((exit): exit is ExitResult => exit != null);
  return {
    n: outcomes.length,
    contWinPct: pct(outcomes.filter((exit) => exit.cont_win).length, outcomes.length),
    contAvg: avg(outcomes.map((exit) => exit.cont_pips)),
    fadeWinPct: pct(outcomes.filter((exit) => exit.fade_win).length, outcomes.length),
    fadeAvg: avg(outcomes.map((exit) => exit.fade_pips)),
  };
}

function writeDetailCsv(rows: DayRow[], outputPath: string): void {
  const header = [
    'trade_date', 'amd_tag', 'amd_outcome_tag', 'judas_direction',
    'day_of_week', 'signal_A', 'signal_B', 'signal_C',
    'first_candle_net_pips', 'first_candle_body_ratio',
    'agrees_judas_inversion',
    'cont_win_1130', 'cont_pips_1130', 'fade_win_1130', 'fade_pips_1130',
    'cont_win_1200', 'cont_pips_1200', 'fade_win_1200', 'fade_pips_1200',
    'cont_win_1230', 'cont_pips_1230', 'fade_win_1230', 'fade_pips_1230',
    'cont_win_1300', 'cont_pips_1300', 'fade_win_1300', 'fade_pips_1300',
    'mfe_cont_1300', 'mfe_fade_1300',
  ].join(',');

  const lines = rows.map((row) => {
    const e1130 = variantExits(row, 'A')?.['11:30'];
    const e1200 = variantExits(row, 'A')?.['12:00'];
    const e1230 = variantExits(row, 'A')?.['12:30'];
    const e1300 = variantExits(row, 'A')?.['13:00'];
    return [
      row.trade_date, row.amd_tag ?? '', row.amd_outcome_tag, row.judas_direction ?? '',
      row.day_of_week, row.signal_A ?? '', row.signal_B ?? '', row.signal_C ?? '',
      row.first_candle_net_pips, row.first_candle_body_ratio,
      row.agrees_judas_inversion ?? '',
      e1130?.cont_win ?? '', e1130?.cont_pips ?? '', e1130?.fade_win ?? '', e1130?.fade_pips ?? '',
      e1200?.cont_win ?? '', e1200?.cont_pips ?? '', e1200?.fade_win ?? '', e1200?.fade_pips ?? '',
      e1230?.cont_win ?? '', e1230?.cont_pips ?? '', e1230?.fade_win ?? '', e1230?.fade_pips ?? '',
      e1300?.cont_win ?? '', e1300?.cont_pips ?? '', e1300?.fade_win ?? '', e1300?.fade_pips ?? '',
      e1300?.mfe_cont ?? '', e1300?.mfe_fade ?? '',
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
    .select('trade_date, amd_tag, amd_outcome_tag, judas_direction, daily_bias_alignment')
    .eq('pair', PAIR)
    .not('amd_outcome_tag', 'is', null);

  if (stateErr || !stateRows) {
    throw new Error(`amd_state fetch failed: ${stateErr?.message ?? 'no data'}`);
  }

  const stateByDate = new Map<string, StateRow>();
  for (const row of stateRows as StateRow[]) {
    stateByDate.set(row.trade_date, row);
  }

  const dayRows: DayRow[] = [];
  let skipped = 0;

  for (const candleRow of candleRows) {
    const tradeDate = candleRow.trade_date as string;
    const stateRow = stateByDate.get(tradeDate);
    const candleCount = candleRow.candle_count as number;
    const candles = candleRow.candles as M5RawCandle[];

    if (!stateRow || candleCount < 60 || !candles || candles.length < 72) {
      skipped += 1;
      continue;
    }

    const signals = computeSignals(candles);
    if (!signals) {
      skipped += 1;
      continue;
    }

    const judasInv = judasInversion(stateRow.judas_direction);
    const agreesJudas = signals.sigA != null && judasInv != null
      ? signals.sigA === judasInv
      : null;

    const exitsByVariant: Partial<Record<VariantKey, Record<string, ExitResult>>> = {};
    if (signals.sigA) exitsByVariant.A = buildVariantExits(candles, signals.sigA);
    if (signals.sigB) exitsByVariant.B = buildVariantExits(candles, signals.sigB);
    if (signals.sigC) exitsByVariant.C = buildVariantExits(candles, signals.sigC);

    dayRows.push({
      trade_date: tradeDate,
      amd_tag: stateRow.amd_tag,
      amd_outcome_tag: stateRow.amd_outcome_tag,
      judas_direction: stateRow.judas_direction,
      daily_bias_alignment: stateRow.daily_bias_alignment,
      day_of_week: dayOfWeek(tradeDate),
      signal_A: signals.sigA,
      signal_B: signals.sigB,
      signal_C: signals.sigC,
      first_candle_net_pips: signals.net1030,
      first_candle_body_ratio: signals.bodyRatio,
      agrees_judas_inversion: agreesJudas,
      exitsByVariant,
    });
  }

  const totalDays = dayRows.length;
  const countA = dayRows.filter((row) => row.signal_A != null).length;
  const countB = dayRows.filter((row) => row.signal_B != null).length;
  const countC = dayRows.filter((row) => row.signal_C != null).length;

  console.log('=== FIRST CANDLE DIRECTION BACKTEST ===');
  console.log(`${totalDays} days | Entry: 11:00 open | Signal: 10:30-11:00 candle direction`);

  console.log('\n── SIGNAL COVERAGE ──');
  console.log(`Variant A (any close, >1p):     N=${countA} fired | ${totalDays - countA} null (flat)`);
  console.log(`Variant B (>=2p threshold):     N=${countB} fired | ${totalDays - countB} null`);
  console.log(`Variant C (body>=50% of range): N=${countC} fired | ${totalDays - countC} null`);

  console.log('\n── CONTINUATION vs FADE — ALL DAYS ──');
  console.log(
    '          | Variant A              | Variant B              | Variant C',
  );
  console.log(
    'EXIT      | ContWin% AvgP | FadeWin% AvgP | ContWin% AvgP | FadeWin% AvgP | ContWin% AvgP | FadeWin% AvgP',
  );
  for (const exitDef of EXITS) {
    const statsA = variantExitStats(dayRows, 'A', exitDef.label);
    const statsB = variantExitStats(dayRows, 'B', exitDef.label);
    const statsC = variantExitStats(dayRows, 'C', exitDef.label);
    console.log(
      `${exitDef.label.padEnd(9)} | ` +
      `${String(statsA.contWinPct).padStart(4)}% ${String(statsA.contAvg).padStart(5)}p | ` +
      `${String(statsA.fadeWinPct).padStart(4)}% ${String(statsA.fadeAvg).padStart(5)}p | ` +
      `${String(statsB.contWinPct).padStart(4)}% ${String(statsB.contAvg).padStart(5)}p | ` +
      `${String(statsB.fadeWinPct).padStart(4)}% ${String(statsB.fadeAvg).padStart(5)}p | ` +
      `${String(statsC.contWinPct).padStart(4)}% ${String(statsC.contAvg).padStart(5)}p | ` +
      `${String(statsC.fadeWinPct).padStart(4)}% ${String(statsC.fadeAvg).padStart(5)}p`,
    );
  }

  const mfeRows = dayRows.filter((row) => variantExits(row, 'A')?.['13:00']);
  console.log('\n── MAX FAVORABLE EXCURSION (MFE) ──');
  console.log(
    `Exit 13:00 | Continuation MFE avg: ${avg(mfeRows.map((row) => variantExits(row, 'A')!['13:00'].mfe_cont))}p | ` +
    `Fade MFE avg: ${avg(mfeRows.map((row) => variantExits(row, 'A')!['13:00'].mfe_fade))}p`,
  );
  const mfeCont = avg(mfeRows.map((row) => variantExits(row, 'A')!['13:00'].mfe_cont));
  const mfeFade = avg(mfeRows.map((row) => variantExits(row, 'A')!['13:00'].mfe_fade));
  console.log(`(${mfeCont >= mfeFade ? 'Continuation' : 'Fade'} has more available opportunity)`);

  const agreeRows = dayRows.filter((row) => row.agrees_judas_inversion === true && variantExits(row, 'A')?.['13:00']);
  const disagreeRows = dayRows.filter((row) => row.agrees_judas_inversion === false && variantExits(row, 'A')?.['13:00']);

  console.log('\n── WHEN FIRST CANDLE AGREES WITH JUDAS INVERSION ──');
  console.log('(Signal direction = Judas inverted direction)');
  console.log(
    `Variant A — Continuation win% at 13:00: ${pct(agreeRows.filter((row) => variantExits(row, 'A')!['13:00'].cont_win).length, agreeRows.length)}%`,
  );
  console.log(
    `Variant A — Fade win% at 13:00: ${pct(agreeRows.filter((row) => variantExits(row, 'A')!['13:00'].fade_win).length, agreeRows.length)}%`,
  );

  console.log('\n── WHEN FIRST CANDLE DISAGREES WITH JUDAS INVERSION ──');
  console.log(
    `Variant A — Continuation win% at 13:00: ${pct(disagreeRows.filter((row) => variantExits(row, 'A')!['13:00'].cont_win).length, disagreeRows.length)}%`,
  );
  console.log(
    `Variant A — Fade win% at 13:00: ${pct(disagreeRows.filter((row) => variantExits(row, 'A')!['13:00'].fade_win).length, disagreeRows.length)}%`,
  );

  console.log('\n── BY LIVE AMD TAG (amd_tag at 10:31) ──');
  for (const tag of ['AMD_FAILED', 'AMD_SHIFTED', 'AMD_NONE']) {
    const tagRows = dayRows.filter((row) => row.amd_tag === tag && variantExits(row, 'A')?.['13:00']);
    console.log(
      `${tag.padEnd(11)} | Cont win% 13:00: ${pct(tagRows.filter((row) => variantExits(row, 'A')!['13:00'].cont_win).length, tagRows.length)}% | ` +
      `Fade win%: ${pct(tagRows.filter((row) => variantExits(row, 'A')!['13:00'].fade_win).length, tagRows.length)}% | N=${tagRows.length}`,
    );
  }

  console.log('\n── BY DAY OF WEEK ──');
  for (const dow of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
    const dowRows = dayRows.filter((row) => row.day_of_week === dow && variantExits(row, 'A')?.['13:00']);
    console.log(
      `${dow} | Cont: ${pct(dowRows.filter((row) => variantExits(row, 'A')!['13:00'].cont_win).length, dowRows.length)}% | ` +
      `Fade: ${pct(dowRows.filter((row) => variantExits(row, 'A')!['13:00'].fade_win).length, dowRows.length)}% | N=${dowRows.length}`,
    );
  }

  let bestCont = { variant: 'A' as VariantKey, exit: '11:30', winPct: 0, avgPips: 0 };
  let bestFade = { variant: 'A' as VariantKey, exit: '11:30', winPct: 0, avgPips: 0 };
  let totalContWin = 0;
  let totalFadeWin = 0;
  let totalContN = 0;

  for (const variant of VARIANTS) {
    for (const exitDef of EXITS) {
      const stats = variantExitStats(dayRows, variant, exitDef.label);
      if (stats.contWinPct > bestCont.winPct) {
        bestCont = { variant, exit: exitDef.label, winPct: stats.contWinPct, avgPips: stats.contAvg };
      }
      if (stats.fadeWinPct > bestFade.winPct) {
        bestFade = { variant, exit: exitDef.label, winPct: stats.fadeWinPct, avgPips: stats.fadeAvg };
      }
    }
  }

  for (const row of dayRows.filter((row) => variantExits(row, 'A')?.['13:00'])) {
    totalContN += 1;
    if (variantExits(row, 'A')!['13:00'].cont_win) totalContWin += 1;
    if (variantExits(row, 'A')!['13:00'].fade_win) totalFadeWin += 1;
  }

  const agreeContWin = pct(
    agreeRows.filter((row) => variantExits(row, 'A')!['13:00'].cont_win).length,
    agreeRows.length,
  );
  const disagreeContWin = pct(
    disagreeRows.filter((row) => variantExits(row, 'A')!['13:00'].cont_win).length,
    disagreeRows.length,
  );
  const overallContWin = pct(totalContWin, totalContN);
  const overallFadeWin = pct(totalFadeWin, totalContN);
  const overallWinner = overallContWin > overallFadeWin ? 'CONTINUATION'
    : overallFadeWin > overallContWin ? 'FADE' : 'TIE';

  console.log('\n── KEY FINDINGS ──');
  console.log(
    `Best exit for continuation (Variant ${bestCont.variant}): ${bestCont.exit} at ${bestCont.winPct}% win, avg +${bestCont.avgPips}p`,
  );
  console.log(
    `Best exit for fade (Variant ${bestFade.variant}): ${bestFade.exit} at ${bestFade.winPct}% win, avg +${bestFade.avgPips}p`,
  );
  console.log(`Continuation vs Fade — which wins overall: ${overallWinner}`);
  console.log(`First candle + Judas agree: continuation win% = ${agreeContWin}% (n=${agreeRows.length})`);
  console.log(`First candle + Judas disagree: continuation win% = ${disagreeContWin}% (n=${disagreeRows.length})`);

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outputPath = path.join(
    process.cwd(),
    'scripts/output',
    `amd_first_candle_direction_${stamp}.csv`,
  );
  writeDetailCsv(dayRows, outputPath);
  console.log(`\nDetail CSV: ${outputPath}`);
  console.log(`Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
