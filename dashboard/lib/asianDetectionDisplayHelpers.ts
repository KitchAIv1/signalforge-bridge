import type { AsianSessionDetection } from '@/lib/directionDecisionTypes';

export const CRON_SCHEDULE = [
  { condition: 'C', time: '01:00' },
  { condition: 'B', time: '03:05' },
  { condition: 'B_SLOW', time: '04:05' },
  { condition: 'A', time: '04:10' },
] as const;

export function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function findTodayChecks(rows: AsianSessionDetection[]): AsianSessionDetection[] {
  const today = todayUtcDateString();
  return rows.filter((row) => row.trade_date === today);
}

export function findTodayActiveDetection(
  rows: AsianSessionDetection[],
): AsianSessionDetection | null {
  const today = todayUtcDateString();
  return (
    rows.find(
      (row) =>
        row.trade_date === today &&
        (row.action === 'SET_LONG' || row.action === 'SET_SHORT'),
    ) ?? null
  );
}

export function nextPendingCron(firedTimes: string[]): string | null {
  const next = CRON_SCHEDULE.find((cron) => !firedTimes.includes(cron.time));
  return next ? `${next.condition} @ ${next.time}` : null;
}

const ASIAN_CRON_TIMES = new Set<string>(CRON_SCHEDULE.map((cron) => cron.time));

export function filterAsianCronRows(
  todayRows: AsianSessionDetection[],
): AsianSessionDetection[] {
  return todayRows.filter((row) => ASIAN_CRON_TIMES.has(row.condition_check_time));
}

export function allAsianCronsComplete(todayRows: AsianSessionDetection[]): boolean {
  const cronRows = filterAsianCronRows(todayRows);
  return CRON_SCHEDULE.every((cron) =>
    cronRows.some((row) => row.condition_check_time === cron.time),
  );
}

export function allCronsFiredToday(todayRows: AsianSessionDetection[]): boolean {
  if (allAsianCronsComplete(todayRows)) return true;
  return todayRows.some(
    (row) => row.action === 'NO_DETECTION' && row.condition_check_time === '04:10',
  );
}

export function latestTodayCheck(
  todayRows: AsianSessionDetection[],
): AsianSessionDetection | null {
  if (!todayRows.length) return null;
  return [...todayRows].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  )[0];
}

export function directionFromDetection(
  row: AsianSessionDetection | null,
): 'long' | 'short' | null {
  if (!row) return null;
  if (row.direction_set === 'long' || row.direction_set === 'short') return row.direction_set;
  if (row.action === 'SET_LONG') return 'long';
  if (row.action === 'SET_SHORT') return 'short';
  return null;
}
