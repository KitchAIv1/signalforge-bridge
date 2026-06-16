import type { BackfillMode, ParsedCliArgs } from './types.js';

const DEFAULT_FROM = '2026-05-21';
const DEFAULT_TO = '2026-05-26';

function expandDateRange(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function readFlagValue(flagName: string): string | null {
  const inlineArg = process.argv.find((arg) => arg.startsWith(`${flagName}=`));
  if (inlineArg) return inlineArg.slice(flagName.length + 1);

  const flagIndex = process.argv.indexOf(flagName);
  if (flagIndex === -1) return null;
  return process.argv[flagIndex + 1] ?? null;
}

export function parseCliArgs(): ParsedCliArgs {
  const runAll = process.argv.includes('--all');
  const windowOnly = process.argv.includes('--window-outcome');

  const mode: BackfillMode = {
    runM5: runAll || (!process.argv.includes('--outcome-only') && !windowOnly),
    runOutcome: runAll || (!process.argv.includes('--m5-only') && !windowOnly),
    runWindow: runAll || windowOnly,
    forceOutcome: process.argv.includes('--force-outcome'),
  };

  const explicitDates = readFlagValue('--dates');
  if (explicitDates) {
    return {
      tradeDates: explicitDates.split(',').map((value) => value.trim()),
      mode,
      allowToday: process.argv.includes('--allow-today'),
    };
  }

  const fromDate = readFlagValue('--from') ?? DEFAULT_FROM;
  const toDate = readFlagValue('--to') ?? DEFAULT_TO;

  return {
    tradeDates: expandDateRange(fromDate, toDate),
    mode,
    allowToday: process.argv.includes('--allow-today'),
  };
}
