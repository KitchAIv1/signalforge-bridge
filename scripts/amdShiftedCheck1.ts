/**
 * SHIFTED bullish_count=3 clustering check — CSV only.
 * Run: npx ts-node scripts/amdShiftedCheck1.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const MAX_GAP_CALENDAR_DAYS = 4;

function loadShiftedCsvRows(csvPath: string): Record<string, string>[] {
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw.trim().split('\n');
  const headers = lines[0]!.split(',');
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    const rowObj: Record<string, string> = {};
    headers.forEach((headerNameCell, idx) => {
      rowObj[headerNameCell.trim()] = (values[idx] ?? '').trim();
    });
    return rowObj;
  });
}

function isScorableAlignment(alignmentCell: string): boolean {
  return alignmentCell === 'true' || alignmentCell === 'false';
}

function countAlignmentBuckets(sliceRows: Record<string, string>[]): {
  correct: number;
  wrong: number;
  excluded: number;
} {
  let correct = 0;
  let wrong = 0;
  let excluded = 0;
  for (const rowRec of sliceRows) {
    const alignCell = rowRec['alignment_correct'] ?? '';
    if (!isScorableAlignment(alignCell)) excluded++;
    else if (alignCell === 'true') correct++;
    else wrong++;
  }
  return { correct, wrong, excluded };
}

function pctCorrect(sliceRows: Record<string, string>[]): string {
  const { correct, wrong } = countAlignmentBuckets(sliceRows);
  const denom = correct + wrong;
  if (denom === 0) return 'n/a';
  return `${Math.round((100 * correct) / denom)}%`;
}

function daysBetweenUtc(firstDate: Date, secondDate: Date): number {
  const msDay = 24 * 3600 * 1000;
  return Math.round((secondDate.getTime() - firstDate.getTime()) / msDay);
}

function buildConsecutiveRuns(sortedDatesAscending: Date[]): Date[][] {
  if (sortedDatesAscending.length === 0) return [];
  const runs: Date[][] = [];
  let runBuffer: Date[] = [sortedDatesAscending[0]!];
  for (let idx = 1; idx < sortedDatesAscending.length; idx++) {
    const prevUtc = sortedDatesAscending[idx - 1]!;
    const nextUtc = sortedDatesAscending[idx]!;
    const gapDays = daysBetweenUtc(prevUtc, nextUtc);
    if (gapDays >= 1 && gapDays <= MAX_GAP_CALENDAR_DAYS) runBuffer.push(nextUtc);
    else {
      runs.push(runBuffer);
      runBuffer = [nextUtc];
    }
  }
  runs.push(runBuffer);
  return runs;
}

function formatDateKeyUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function quarterBucketLabel(d: Date): string {
  const monthUtc = d.getUTCMonth();
  const yearUtc = d.getUTCFullYear();
  let quarterOrdinal: 1 | 2 | 3 | 4;
  let rangeBracket: string;
  if (monthUtc <= 2) {
    quarterOrdinal = 1;
    rangeBracket = '(Jan-Mar)';
  } else if (monthUtc <= 5) {
    quarterOrdinal = 2;
    rangeBracket = '(Apr-Jun)';
  } else if (monthUtc <= 8) {
    quarterOrdinal = 3;
    rangeBracket = '(Jul-Sep)';
  } else {
    quarterOrdinal = 4;
    rangeBracket = '(Oct-Dec)';
  }
  return `Q${quarterOrdinal} ${yearUtc} ${rangeBracket}`;
}

function sortQuarterLabels(labelList: string[]): string[] {
  const orderKeyScore = (labelText: string): number => {
    const labelMatchQuarter = /^Q(\d) (\d{4})/.exec(labelText);
    if (!labelMatchQuarter) return 999999;
    const qOrd = parseInt(labelMatchQuarter[1]!, 10);
    const yrNum = parseInt(labelMatchQuarter[2]!, 10);
    return yrNum * 4 + qOrd;
  };
  return [...labelList].sort((leftLabel, rightLabel) =>
    orderKeyScore(leftLabel) - orderKeyScore(rightLabel),
  );
}

function mainShiftedRun(): void {
  const csvPath = path.join(__dirname, 'output', 'amd_distribution_backtest.csv');
  const rowsAll = loadShiftedCsvRows(csvPath);

  const shifted3Only = rowsAll.filter(
    (rowRec) =>
      rowRec['amd_tag'] === 'AMD_SHIFTED' &&
      rowRec['layer4_bullish_count'] === '3',
  );

  shifted3Only.sort((rowA, rowB) => {
    const timeA = new Date(rowA['trade_date']).getTime();
    const timeB = new Date(rowB['trade_date']).getTime();
    return timeA - timeB;
  });

  const monthKeySet = new Set<string>();
  for (const rowRec of shifted3Only) monthKeySet.add(rowRec['trade_date'].slice(0, 7));

  console.log('=== SHIFTED count=3 — Monthly Distribution ===');
  const sortedMonthKeys = [...monthKeySet].sort();
  for (const monthYm of sortedMonthKeys) {
    const monthSlice = shifted3Only.filter((r) => r['trade_date'].startsWith(monthYm));
    const { correct, wrong, excluded } = countAlignmentBuckets(monthSlice);
    console.log(
      `${monthYm} | n=${monthSlice.length} | correct=${correct} | wrong=${wrong} | excluded=${excluded}`,
    );
  }

  const tradeDateObjs = shifted3Only.map((r) => new Date(r['trade_date']));
  const runsGrouped = buildConsecutiveRuns(tradeDateObjs);
  console.log('');
  console.log('=== SHIFTED count=3 — Consecutive Runs ===');
  runsGrouped.forEach((runDatesUtc, runIndex) => {
    const scoredInRun = shifted3Only.filter((r) =>
      runDatesUtc.some((d) => formatDateKeyUtc(d) === r['trade_date']),
    );
    const tally = countAlignmentBuckets(scoredInRun);
    const scoreDenom = tally.correct + tally.wrong;
    const scoreLabel = scoreDenom === 0 ? `n/a` : `${tally.correct}/${scoreDenom}`;
    const firstKey = formatDateKeyUtc(runDatesUtc[0]!);
    const lastKey = formatDateKeyUtc(runDatesUtc[runDatesUtc.length - 1]!);
    const spanLabel =
      runDatesUtc.length === 1
        ? `${firstKey} (1 day isolated)`
        : `${firstKey} → ${lastKey} (${runDatesUtc.length} days)`;
    console.log(`Run ${runIndex + 1}: ${spanLabel} | correct: ${scoreLabel}`);
  });

  const totalRunsCt = runsGrouped.length;
  const totalDaysAcrossRuns = runsGrouped.reduce((sum, runUtc) => sum + runUtc.length, 0);
  const maxRunSz = runsGrouped.reduce((best, runUtc) => Math.max(best, runUtc.length), 0);
  const avgRunLen =
    totalRunsCt > 0 ? (totalDaysAcrossRuns / totalRunsCt).toFixed(1) : '0.0';
  console.log(
    `\nTotal runs: ${totalRunsCt} | Avg run length: ${avgRunLen} | Max run: ${maxRunSz} days`,
  );

  const quarterKeySet = new Set<string>();
  for (const rowRec of shifted3Only)
    quarterKeySet.add(quarterBucketLabel(new Date(rowRec['trade_date'])));

  console.log('');
  console.log('=== SHIFTED count=3 — By Quarter ===');
  for (const quarterPretty of sortQuarterLabels([...quarterKeySet])) {
    const qSliceOnly = shifted3Only.filter((r) =>
      quarterBucketLabel(new Date(r['trade_date'])) === quarterPretty,
    );
    console.log(
      `${quarterPretty} | n=${qSliceOnly.length} | correct: ${pctCorrect(qSliceOnly)}`,
    );
  }
}

const invokingPathname = process.argv[1] ?? '';
if (invokingPathname.includes('amdShiftedCheck1')) mainShiftedRun();
