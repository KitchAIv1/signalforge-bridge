/**
 * SHIFTED + reconstructed weekly bias from last 20 D1 bars (CSV + OANDA).
 * Run: npx ts-node scripts/amdShiftedCheck2.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fetchCompletedCandles } from '../src/connectors/oanda';
import { csvEscape } from './amdBackfillCsv';

const OANDA_SLEEP_MS = 250;
const INSTRUMENT = 'AUD_USD';

type OandaD1Bar = {
  time: string;
  mid: { o: string; h: string; l: string; c: string };
  complete: boolean;
};

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, delayMs));
}

function loadCsv(filePathCsv: string): Record<string, string>[] {
  const rawText = fs.readFileSync(filePathCsv, 'utf-8');
  const linesCsv = rawText.trim().split('\n');
  const headersCsv = linesCsv[0]!.split(',');
  return linesCsv.slice(1).map((oneLineCsv) => {
    const valsCsv = oneLineCsv.split(',');
    const objCsv: Record<string, string> = {};
    headersCsv.forEach((headerNameCsv, columnIndexCsv) => {
      objCsv[headerNameCsv.trim()] = (valsCsv[columnIndexCsv] ?? '').trim();
    });
    return objCsv;
  });
}

function getISOWeek(dateIsoStrUtc: string): string {
  const cursorDateUtc = new Date(dateIsoStrUtc);
  const dowNumUtc = cursorDateUtc.getUTCDay() || 7;
  cursorDateUtc.setUTCDate(cursorDateUtc.getUTCDate() + 4 - dowNumUtc);
  const startOfCalendarYearUtc = new Date(Date.UTC(cursorDateUtc.getUTCFullYear(), 0, 1));
  const weekOrdinalNumUtc = Math.ceil(
    (((cursorDateUtc.getTime() - startOfCalendarYearUtc.getTime()) / 86400000) + 1) / 7,
  );
  return `${cursorDateUtc.getUTCFullYear()}-W${String(weekOrdinalNumUtc).padStart(2, '0')}`;
}

function weekTrendFromBars(barsSortedInputUtc: OandaD1Bar[]): 'UP' | 'DOWN' {
  const sortedChronoUtc = [...barsSortedInputUtc].sort(
    (lhsUtc, rhsUtc) =>
      new Date(lhsUtc.time).getTime() - new Date(rhsUtc.time).getTime(),
  );
  const firstOpenUtc = parseFloat(sortedChronoUtc[0]!.mid.o);
  const lastCloseUtc = parseFloat(sortedChronoUtc[sortedChronoUtc.length - 1]!.mid.c);
  return lastCloseUtc > firstOpenUtc ? 'UP' : 'DOWN';
}

type IsoWeekBucket = {
  isoWeekKeyStr: string;
  earliestUtcMs: number;
  barsInWeek: OandaD1Bar[];
};

function groupTwentyDailyBarsByIsoWeek(barBundleUtcTwenty: OandaD1Bar[]): IsoWeekBucket[] {
  const weekKeyToBarsMapUtc = new Map<string, OandaD1Bar[]>();
  for (const singleDailyBarUtc of barBundleUtcTwenty) {
    const keyIsoUtc = getISOWeek(singleDailyBarUtc.time);
    const accumulatingBarsUtc = weekKeyToBarsMapUtc.get(keyIsoUtc) ?? [];
    accumulatingBarsUtc.push(singleDailyBarUtc);
    weekKeyToBarsMapUtc.set(keyIsoUtc, accumulatingBarsUtc);
  }
  const bucketListAscendingUtc: IsoWeekBucket[] = [];
  for (const [wkKeyUtc, bundledBarsUtc] of weekKeyToBarsMapUtc) {
    bucketListAscendingUtc.push({
      isoWeekKeyStr: wkKeyUtc,
      earliestUtcMs: Math.min(
        ...bundledBarsUtc.map((bUtc) => new Date(bUtc.time).getTime()),
      ),
      barsInWeek: bundledBarsUtc,
    });
  }
  bucketListAscendingUtc.sort((aUtcBucket, bUtcBucket) =>
    aUtcBucket.earliestUtcMs - bUtcBucket.earliestUtcMs);
  return bucketListAscendingUtc;
}

type LastThreeWeeklySummary = {
  majorityDir: 'UP' | 'DOWN' | 'NEUTRAL';
  weekDirsLeftToRight: Array<'UP' | 'DOWN' | ''>;
};

function summarizeLastThreeWeeks(
  ascendingWeekBucketsUtc: IsoWeekBucket[],
  tradeDateYmdUtc: string,
): LastThreeWeeklySummary {
  const tradeDateWeekKey = getISOWeek(`${tradeDateYmdUtc}T00:00:00.000Z`);
  const completedWeeksOnly = ascendingWeekBucketsUtc.filter(
    (weekBucketUtc) => weekBucketUtc.isoWeekKeyStr !== tradeDateWeekKey,
  );

  const paddedThreeSlots: Array<'UP' | 'DOWN' | ''> = ['', '', ''];

  if (completedWeeksOnly.length < 3) {
    completedWeeksOnly.forEach((bucketUtc, slotIdxUtc) => {
      paddedThreeSlots[slotIdxUtc] = weekTrendFromBars(bucketUtc.barsInWeek);
    });
    return { majorityDir: 'NEUTRAL', weekDirsLeftToRight: paddedThreeSlots };
  }

  const lastThreeAscendingUtc = completedWeeksOnly.slice(-3);
  const threeTrendLabelsUtc = lastThreeAscendingUtc.map((weeklyBucketUtc) =>
    weekTrendFromBars(weeklyBucketUtc.barsInWeek),
  );

  let upTallyUtc = 0;
  let downTallyUtc = 0;
  for (const labelUtc of threeTrendLabelsUtc) {
    if (labelUtc === 'UP') upTallyUtc++;
    else downTallyUtc++;
  }

  if (upTallyUtc === downTallyUtc) {
    return { majorityDir: 'NEUTRAL', weekDirsLeftToRight: threeTrendLabelsUtc };
  }

  const winningDirUtc: 'UP' | 'DOWN' = upTallyUtc > downTallyUtc ? 'UP' : 'DOWN';
  return {
    majorityDir: winningDirUtc,
    weekDirsLeftToRight: threeTrendLabelsUtc,
  };
}

function layerCsvToDir(layerBiasCellCsvText: string): 'UP' | 'DOWN' | 'NEUTRAL' {
  if (layerBiasCellCsvText === 'TRENDING_UP') return 'UP';
  if (layerBiasCellCsvText === 'TRENDING_DOWN') return 'DOWN';
  return 'NEUTRAL';
}

function compareWeeklyVsLayerCsv(
  weeklyMajorDirUtc: 'UP' | 'DOWN' | 'NEUTRAL',
  layer4CsvTextCell: string,
): 'AGREES' | 'DISAGREES' | 'NEUTRAL' {
  const layerDirCsvParsed = layerCsvToDir(layer4CsvTextCell);
  if (weeklyMajorDirUtc === 'NEUTRAL' || layerDirCsvParsed === 'NEUTRAL') {
    return 'NEUTRAL';
  }
  return weeklyMajorDirUtc === layerDirCsvParsed ? 'AGREES' : 'DISAGREES';
}

function pctPredictedCorrect(alignmentColumnStringsCsv: string[]): string {
  const scoredCsvOnly = alignmentColumnStringsCsv.filter(
    (alignmentCellCsvTxt) =>
      alignmentCellCsvTxt === 'true' || alignmentCellCsvTxt === 'false',
  );
  if (scoredCsvOnly.length === 0) return 'n/a';
  const correctHitsCsvQty = scoredCsvOnly.filter((cCsvTxtUtc) =>
    cCsvTxtUtc === 'true').length;

  const denomCsvQtyUtc = scoredCsvOnly.length;

  return `${Math.round((100 * correctHitsCsvQty) / denomCsvQtyUtc)}%`;
}

type OutputAnalysisRowCsv = {
  trade_date: string;
  daily_bias_alignment: string;
  layer4_d1_bias: string;
  layer4_bullish_count: string;
  distribution_direction: string;
  alignment_correct: string;
  weekly_majority: string;
  weekly_alignment: string;
  week1_dir: string;
  week2_dir: string;
  week3_dir: string;
};

async function pullLastTwentyDailyOanda(dayKeyYmdUtc: string): Promise<OandaD1Bar[]> {
  const tradeUtcOpen = new Date(`${dayKeyYmdUtc}T00:00:00.000Z`);
  const fromUtcRolling = new Date(tradeUtcOpen);
  fromUtcRolling.setUTCDate(fromUtcRolling.getUTCDate() - 30);

  const d1ReturnedUtc = await fetchCompletedCandles(
    INSTRUMENT,
    'D',
    fromUtcRolling.toISOString(),
    tradeUtcOpen.toISOString(),
  );
  return d1ReturnedUtc.slice(-20);
}

function writeStudyOutputCsv(analysisRowsAscendingCsv: OutputAnalysisRowCsv[], outPathCsv: string): void {
  const csvColumnOrderUtc = [
    'trade_date',
    'daily_bias_alignment',
    'layer4_d1_bias',
    'layer4_bullish_count',
    'distribution_direction',
    'alignment_correct',
    'weekly_majority',
    'weekly_alignment',
    'week1_dir',
    'week2_dir',
    'week3_dir',
  ];
  const outLinesUtcTxt = [csvColumnOrderUtc.join(',')];

  for (const rowRecordCsvUtc of analysisRowsAscendingCsv) {
    outLinesUtcTxt.push(
      csvColumnOrderUtc.map((colNameUtcCsvTxt) =>
        csvEscape(rowRecordCsvUtc[colNameUtcCsvTxt as keyof OutputAnalysisRowCsv] ?? ''),
      ).join(','),
    );
  }
  fs.writeFileSync(outPathCsv, outLinesUtcTxt.join('\n'), 'utf8');
}

function printlnSummaryBucketCsvUtc(
  labelKeyCsvUtcTxt: string,
  scopedRowsCsvUtc: OutputAnalysisRowCsv[],
  tailNoteCsvTxtOpt?: string,
): void {
  const alignCsvColValsUtc = scopedRowsCsvUtc.map((rCsvUtcTxt) =>
    rCsvUtcTxt.alignment_correct);
  let outMsgCsvTxtUtc =
    `${labelKeyCsvUtcTxt.padEnd(25)} | n=${scopedRowsCsvUtc.length} ` +
    `| alignment_correct: ${pctPredictedCorrect(alignCsvColValsUtc)}`;

  if (tailNoteCsvTxtOpt) outMsgCsvTxtUtc += ` | ${tailNoteCsvTxtOpt}`;
  console.log(outMsgCsvTxtUtc);
}

function filterByWeeklyAgreementCsvUtc(
  allRowsUtcCsvBloc: OutputAnalysisRowCsv[],
  weeklyAgreementTagCsvUtcTxt: string,
): OutputAnalysisRowCsv[] {
  return allRowsUtcCsvBloc.filter((rBlocCsvUtcTxt) =>
    rBlocCsvUtcTxt.weekly_alignment === weeklyAgreementTagCsvUtcTxt,
  );
}

async function augmentRowsFromOandaWorkload(
  chronologicalCsvWorkloadUtc: Record<string, string>[],
): Promise<OutputAnalysisRowCsv[]> {
  const builtRowsAscendingCsvUtcBloc: OutputAnalysisRowCsv[] = [];

  for (let jobIndexUtc = 0; jobIndexUtc < chronologicalCsvWorkloadUtc.length; jobIndexUtc++) {

    const srcCsvUtcRowBloc = chronologicalCsvWorkloadUtc[jobIndexUtc]!;
    const tradeYmdUtcKeyCsvTxt = srcCsvUtcRowBloc['trade_date'];

    const d1BundleTwentyUtcBloc = await pullLastTwentyDailyOanda(tradeYmdUtcKeyCsvTxt);

    const weekBucketsAscendingUtcBloc = groupTwentyDailyBarsByIsoWeek(d1BundleTwentyUtcBloc);

    const last3SummaryBlocUtcCsv = summarizeLastThreeWeeks(
      weekBucketsAscendingUtcBloc,
      tradeYmdUtcKeyCsvTxt,
    );

    const layer4CsvTextUtcTxt = srcCsvUtcRowBloc['layer4_d1_bias'];

    builtRowsAscendingCsvUtcBloc.push({
      trade_date: tradeYmdUtcKeyCsvTxt,
      daily_bias_alignment: srcCsvUtcRowBloc['daily_bias_alignment'],
      layer4_d1_bias: layer4CsvTextUtcTxt,
      layer4_bullish_count: srcCsvUtcRowBloc['layer4_bullish_count'],
      distribution_direction: srcCsvUtcRowBloc['distribution_direction'],
      alignment_correct: srcCsvUtcRowBloc['alignment_correct'],
      weekly_majority: last3SummaryBlocUtcCsv.majorityDir,
      weekly_alignment: compareWeeklyVsLayerCsv(
        last3SummaryBlocUtcCsv.majorityDir,
        layer4CsvTextUtcTxt,
      ),
      week1_dir: last3SummaryBlocUtcCsv.weekDirsLeftToRight[0] ?? '',
      week2_dir: last3SummaryBlocUtcCsv.weekDirsLeftToRight[1] ?? '',
      week3_dir: last3SummaryBlocUtcCsv.weekDirsLeftToRight[2] ?? '',
    });

    if (jobIndexUtc + 1 < chronologicalCsvWorkloadUtc.length) {
      await sleep(OANDA_SLEEP_MS);
    }
  }

  return builtRowsAscendingCsvUtcBloc;
}

function printConflictWeeklySection(allRowsBlocCsvUtc: OutputAnalysisRowCsv[]): void {
  const conflictBlocCsvUtc = allRowsBlocCsvUtc.filter((rCsvUtcBlocTxtCsv) =>
    rCsvUtcBlocTxtCsv.daily_bias_alignment === 'CONFLICTED');

  const d1StandalonePctBlocCsvUtcTxt = pctPredictedCorrect(
    conflictBlocCsvUtc.map((rCsvUtcBlocRowTxtUtc) =>
      rCsvUtcBlocRowTxtUtc.alignment_correct),
  );

  console.log(
    '--- SHIFTED CONFLICTED — Does weekly alignment improve prediction? ---',
  );
  printlnSummaryBucketCsvUtc(
    'weekly_alignment=AGREES',
    filterByWeeklyAgreementCsvUtc(conflictBlocCsvUtc, 'AGREES'),
    `(D1 alone was ${d1StandalonePctBlocCsvUtcTxt})`,
  );
  printlnSummaryBucketCsvUtc(
    'weekly_alignment=DISAGREES',
    filterByWeeklyAgreementCsvUtc(conflictBlocCsvUtc, 'DISAGREES'),
  );
  printlnSummaryBucketCsvUtc(
    'weekly_alignment=NEUTRAL',
    filterByWeeklyAgreementCsvUtc(conflictBlocCsvUtc, 'NEUTRAL'),
  );
}

function printAlignedWeeklySection(allCsvRowsUtcBloc: OutputAnalysisRowCsv[]): void {
  const alignedBlocCsvUtc = allCsvRowsUtcBloc.filter((rCsvUtcBlocRowTxtUtc) =>
    rCsvUtcBlocRowTxtUtc.daily_bias_alignment === 'ALIGNED');

  console.log('');
  const baselinePctTxtBlocUtcCsv = pctPredictedCorrect(
    alignedBlocCsvUtc.map((rCsvUtcBlocRowTxtUtc) =>
      rCsvUtcBlocRowTxtUtc.alignment_correct),
  );

  console.log(
    `--- SHIFTED ALIGNED — Weekly alignment breakdown (baseline ${baselinePctTxtBlocUtcCsv}) ---`,
  );
  printlnSummaryBucketCsvUtc(
    'weekly_alignment=AGREES',
    filterByWeeklyAgreementCsvUtc(alignedBlocCsvUtc, 'AGREES'),
  );
  printlnSummaryBucketCsvUtc(
    'weekly_alignment=DISAGREES',
    filterByWeeklyAgreementCsvUtc(alignedBlocCsvUtc, 'DISAGREES'),
  );
  printlnSummaryBucketCsvUtc(
    'weekly_alignment=NEUTRAL',
    filterByWeeklyAgreementCsvUtc(alignedBlocCsvUtc, 'NEUTRAL'),
  );
}

function printConflictRescueSection(allBlocRowsCsvUtcTxt: OutputAnalysisRowCsv[]): void {
  const conflictSubsetCsvBlocUtcTxt = allBlocRowsCsvUtcTxt.filter((rowCsvBlocUtcAlignedTxtBloc) =>
    rowCsvBlocUtcAlignedTxtBloc.daily_bias_alignment === 'CONFLICTED');

  const agreesSubsetCsvBlocUtcTxt = conflictSubsetCsvBlocUtcTxt.filter((conflictRowCsvBlocUtcTxt) =>
    conflictRowCsvBlocUtcTxt.weekly_alignment === 'AGREES');

  console.log('');
  console.log(
    '--- Key Question: D1 CONFLICTED + W1 AGREES — does W1 rescue the signal? ---',
  );

  console.log(
    `CONFLICTED + W1 AGREES    | n=${agreesSubsetCsvBlocUtcTxt.length} ` +
      `| correct: ${pctPredictedCorrect(
        agreesSubsetCsvBlocUtcTxt.map((alignedRowBlocCsvUtcTxt) =>
          alignedRowBlocCsvUtcTxt.alignment_correct),
      )}`,
  );

  const disagreesBlocCsvUtcTxtCsv = conflictSubsetCsvBlocUtcTxt.filter((csvRowBlocUtcCsvTxt) =>
    csvRowBlocUtcCsvTxt.weekly_alignment === 'DISAGREES');

  console.log(
    `CONFLICTED + W1 DISAGREES | n=${disagreesBlocCsvUtcTxtCsv.length} ` +
      `| correct: ${pctPredictedCorrect(
        disagreesBlocCsvUtcTxtCsv.map((disRowCsvBlocUtcTxt) =>
          disRowCsvBlocUtcTxt.alignment_correct),
      )}`,
  );
}

async function runShiftedWeeklyCheckCsv(): Promise<void> {
  dotenv.config();

  const distroCsvUtcPathBlocTxtCsv = path.join(__dirname,
    'output',
    'amd_distribution_backtest.csv');

  const distroCsvTotalRowsBlocUtcTxtCsv = loadCsv(distroCsvUtcPathBlocTxtCsv);

  const shiftedConflictCsvBlocUtcCsvTxtRowsBloc = distroCsvTotalRowsBlocUtcTxtCsv.filter(
    (distroCsvRowUtcTxtBloc) =>
      distroCsvRowUtcTxtBloc['amd_tag'] === 'AMD_SHIFTED' &&
      distroCsvRowUtcTxtBloc['daily_bias_alignment'] === 'CONFLICTED',
  );

  const shiftedAlignedCsvBlocUtcTxtRowsBloc = distroCsvTotalRowsBlocUtcTxtCsv.filter(
    (distroCsvRowUtcTxtBloc) =>
      distroCsvRowUtcTxtBloc['amd_tag'] === 'AMD_SHIFTED' &&
      distroCsvRowUtcTxtBloc['daily_bias_alignment'] === 'ALIGNED',
  );

  const mergedWorkloadChronoBlocUtcCsvRowsTxtBloc = [...shiftedConflictCsvBlocUtcCsvTxtRowsBloc,
    ...shiftedAlignedCsvBlocUtcTxtRowsBloc].sort(
    (lhsCsvBlocUtcTxt, rhsBlocCsvUtcCsvTxtBloc) =>
      new Date(lhsCsvBlocUtcTxt['trade_date']).getTime() -
      new Date(rhsBlocCsvUtcCsvTxtBloc['trade_date']).getTime());

  const analysisRowsCsvBlocUtcBlocTxtBlocOut =
    await augmentRowsFromOandaWorkload(mergedWorkloadChronoBlocUtcCsvRowsTxtBloc);

  const csvOutBlocUtcCsvPathBlocTxtBloc = path.join(__dirname,
    'output',
    'amd_shifted_check2.csv');
  fs.mkdirSync(path.dirname(csvOutBlocUtcCsvPathBlocTxtBloc), { recursive: true });

  analysisRowsCsvBlocUtcBlocTxtBlocOut.sort(
    (lhsDateSortCsvUtcBloc, rhsBlocSortCsvUtcTxtBlocUtc) =>
      new Date(lhsDateSortCsvUtcBloc.trade_date).getTime() -
      new Date(rhsBlocSortCsvUtcTxtBlocUtc.trade_date).getTime());

  writeStudyOutputCsv(analysisRowsCsvBlocUtcBlocTxtBlocOut,
    csvOutBlocUtcCsvPathBlocTxtBloc);

  console.log('=== CHECK 2 — W1 Reconstruction on SHIFTED Days ===');
  console.log(`Total SHIFTED CONFLICTED processed: ${
    analysisRowsCsvBlocUtcBlocTxtBlocOut.filter((rCsvUtcBlocCsvTxtBloc) =>
        rCsvUtcBlocCsvTxtBloc.daily_bias_alignment === 'CONFLICTED').length
  }`);

  console.log(`Total SHIFTED ALIGNED processed: ${analysisRowsCsvBlocUtcBlocTxtBlocOut.filter((rBlocCsvUtcTxtBlocUtc) =>
    rBlocCsvUtcTxtBlocUtc.daily_bias_alignment === 'ALIGNED').length}`,
  );

  console.log('');
  printConflictWeeklySection(analysisRowsCsvBlocUtcBlocTxtBlocOut);
  printAlignedWeeklySection(analysisRowsCsvBlocUtcBlocTxtBlocOut);
  printConflictRescueSection(analysisRowsCsvBlocUtcBlocTxtBlocOut);

  console.log(`\n[Check2] CSV written: ${csvOutBlocUtcCsvPathBlocTxtBloc}`);
}

const entryScriptBlocPathnameCsvUtcBlocTxtBloc = process.argv[1] ?? '';
if (entryScriptBlocPathnameCsvUtcBlocTxtBloc.includes('amdShiftedCheck2')) {
  void runShiftedWeeklyCheckCsv()
    .then(() => process.exit(0))
    .catch((fatalScriptErrCsvBlocUtcBlocTxtBloc: unknown) => {
      console.error('[Check2] Fatal:', fatalScriptErrCsvBlocUtcBlocTxtBloc);
      process.exit(1);
    });
}
