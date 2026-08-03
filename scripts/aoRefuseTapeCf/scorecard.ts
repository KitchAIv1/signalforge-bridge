/** Promote/kill scorecard for refuse-tape policies vs live AO truth. */

import type { PolicyDayScore, PolicyScorecard, PolicyTradeResult } from './types.js';

const PROTECT_DAYS = ['2026-07-14', '2026-07-20'] as const;
const BLOWUP_DAY = '2026-07-21';
const RECOVERY_DAYS = ['2026-07-10', '2026-07-13'] as const;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round0(value: number): number {
  return Math.round(value);
}

function dayRollup(results: readonly PolicyTradeResult[]): PolicyDayScore[] {
  const map = new Map<string, PolicyDayScore>();
  for (const row of results) {
    if (!map.has(row.day)) {
      map.set(row.day, {
        day: row.day,
        actualPips: 0,
        actualDollars: 0,
        cfPips: 0,
        cfDollars: 0,
        tradesTaken: 0,
        tradesSkipped: 0,
      });
    }
    const bucket = map.get(row.day)!;
    bucket.actualPips += row.actualPips;
    bucket.actualDollars += row.actualDollars;
    bucket.cfPips += row.cfPips;
    bucket.cfDollars += row.cfDollars;
    if (row.taken) bucket.tradesTaken += 1;
    else bucket.tradesSkipped += 1;
  }
  return [...map.values()]
    .map((day) => ({
      ...day,
      actualPips: round1(day.actualPips),
      actualDollars: round0(day.actualDollars),
      cfPips: round1(day.cfPips),
      cfDollars: round0(day.cfDollars),
    }))
    .sort((left, right) => left.day.localeCompare(right.day));
}

function dayCf(byDay: readonly PolicyDayScore[], day: string): PolicyDayScore | undefined {
  return byDay.find((row) => row.day === day);
}

export function buildScorecard(
  label: string,
  results: readonly PolicyTradeResult[],
): PolicyScorecard {
  const byDay = dayRollup(results);
  const totalActualPips = round1(byDay.reduce((sum, day) => sum + day.actualPips, 0));
  const totalActualDollars = round0(byDay.reduce((sum, day) => sum + day.actualDollars, 0));
  const totalCfPips = round1(byDay.reduce((sum, day) => sum + day.cfPips, 0));
  const totalCfDollars = round0(byDay.reduce((sum, day) => sum + day.cfDollars, 0));
  const notes: string[] = [];
  let promoteOk = true;

  const blowup = dayCf(byDay, BLOWUP_DAY);
  if (!blowup) {
    promoteOk = false;
    notes.push('missing Jul-21 blow-up day');
  } else {
    const dollarCut = blowup.actualDollars < 0
      ? (blowup.cfDollars - blowup.actualDollars) / Math.abs(blowup.actualDollars)
      : 0;
    if (dollarCut < 0.5) {
      promoteOk = false;
      notes.push(
        `Jul-21 $ damage cut ${round0(dollarCut * 100)}% < 50% target (cf=${blowup.cfDollars})`,
      );
    } else {
      notes.push(`Jul-21 $ damage cut ${round0(dollarCut * 100)}% (cf=${blowup.cfDollars})`);
    }
  }

  for (const day of PROTECT_DAYS) {
    const row = dayCf(byDay, day);
    if (!row || row.actualDollars <= 0) continue;
    const kept = row.cfDollars / row.actualDollars;
    if (kept < 0.9) {
      promoteOk = false;
      notes.push(`${day} kept ${round0(kept * 100)}% of $ < 90%`);
    } else {
      notes.push(`${day} kept ${round0(kept * 100)}% of $`);
    }
  }

  for (const day of RECOVERY_DAYS) {
    const row = dayCf(byDay, day);
    if (!row) continue;
    if (row.actualDollars > 0 && row.cfDollars < 0) {
      promoteOk = false;
      notes.push(`${day} flipped green→red (cf=${row.cfDollars})`);
    }
  }

  return {
    label,
    totalActualPips,
    totalActualDollars,
    totalCfPips,
    totalCfDollars,
    deltaPips: round1(totalCfPips - totalActualPips),
    deltaDollars: round0(totalCfDollars - totalActualDollars),
    byDay,
    promoteOk,
    promoteNotes: notes,
  };
}

export function formatScorecard(score: PolicyScorecard): string[] {
  const lines = [
    `\n=== ${score.label} ===`,
    `actual: ${score.totalActualPips}p / $${score.totalActualDollars}`,
    `cf:     ${score.totalCfPips}p / $${score.totalCfDollars}`,
    `delta:  ${score.deltaPips >= 0 ? '+' : ''}${score.deltaPips}p / ${score.deltaDollars >= 0 ? '+' : ''}$${score.deltaDollars}`,
    `PROMOTE: ${score.promoteOk ? 'YES' : 'NO'}`,
    ...score.promoteNotes.map((note) => `  - ${note}`),
    'by day:',
  ];
  for (const day of score.byDay) {
    lines.push(
      `  ${day.day} actual=${day.actualPips}p/$${day.actualDollars} ` +
        `cf=${day.cfPips}p/$${day.cfDollars} taken=${day.tradesTaken} skipped=${day.tradesSkipped}`,
    );
  }
  return lines;
}
