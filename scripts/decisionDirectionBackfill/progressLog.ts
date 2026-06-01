import type { DayBackfillResult } from './types.js';

export function formatDayProgressLine(
  index: number,
  total: number,
  dayResult: DayBackfillResult,
  elapsedMs: number,
): string {
  const pct = Math.round(((index + 1) / total) * 100);
  const elapsedSec = (elapsedMs / 1000).toFixed(0);
  const avgMsPerDay = elapsedMs / (index + 1);
  const remainingMs = avgMsPerDay * (total - index - 1);
  const etaMin = (remainingMs / 60000).toFixed(1);

  const tag = dayResult.amd_tag_computed ?? '—';
  const decision = dayResult.decision_direction ?? '—';
  const dbDir = dayResult.auto_direction_db ?? '—';
  const changedMark = dayResult.changed ? 'CHANGED' : 'same';
  const flagMark = dayResult.flagged_tag ? ' FLAG' : '';

  if (dayResult.status === 'skipped_existing') {
    return (
      `[DecisionBackfill] [${index + 1}/${total}] ${pct}% ` +
      `${dayResult.trade_date} skip(existing=${decision}) ` +
      `elapsed=${elapsedSec}s eta=${etaMin}m`
    );
  }

  if (dayResult.status === 'error') {
    return (
      `[DecisionBackfill] [${index + 1}/${total}] ${pct}% ` +
      `${dayResult.trade_date} ERROR: ${dayResult.error_message} ` +
      `elapsed=${elapsedSec}s eta=${etaMin}m`
    );
  }

  return (
    `[DecisionBackfill] [${index + 1}/${total}] ${pct}% ` +
    `${dayResult.trade_date} tag=${tag} decision=${decision} ` +
    `db=${dbDir} ${changedMark}${flagMark} ` +
    `elapsed=${elapsedSec}s eta=${etaMin}m`
  );
}

export function logMilestone(
  index: number,
  total: number,
  computed: number,
  changed: number,
  flagged: number,
  errors: number,
): void {
  if ((index + 1) % 25 !== 0 && index + 1 !== total) return;
  console.log(
    `[DecisionBackfill] --- milestone ${index + 1}/${total} --- ` +
      `computed=${computed} changed=${changed} flagged=${flagged} errors=${errors}`,
  );
}
