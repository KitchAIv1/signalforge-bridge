// amd_outcome_tag NOT referenced
// Legacy asian_direction_log helpers — kept for AsianDirectionPanel and API route.

import type { AsianDirectionLogEntry } from '@/lib/fetchAsianDirectionLog';
import type { AmdState } from '@/lib/types';
import type { AsianSessionDetection, AsianSessionVerdict } from '@/lib/directionDecisionTypes';
import {
  allCronsFiredToday,
  findTodayActiveDetection,
  findTodayChecks,
  nextPendingCron,
} from '@/lib/asianDetectionDisplayHelpers';
import {
  isForexWeekendClosed,
  todayUtcDate,
} from '@/lib/directionDecisionPhases';

const DIRECTION_SET_ACTIONS = new Set(['SET_LONG', 'SET_SHORT', 'NO_CHANGE']);
const SKIP_ACTIONS = new Set(['SKIPPED_NOT_SHIFTED', 'SKIPPED_NO_D1', 'SKIPPED_NO_AMD']);

export function findTodayAsianRows(rows: AsianDirectionLogEntry[]): AsianDirectionLogEntry[] {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const today = now.toISOString().slice(0, 10);

  if (utcHour < 8) {
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const yesterdayRows = rows.filter(
      (row) =>
        row.trade_date === yesterdayStr &&
        (row.action === 'SET_LONG' ||
          row.action === 'SET_SHORT' ||
          row.action === 'NO_CHANGE' ||
          row.action === 'SKIPPED_NOT_SHIFTED' ||
          row.action === 'SKIPPED_NO_D1' ||
          row.action === 'SKIPPED_NO_AMD'),
    );

    if (yesterdayRows.length > 0) return yesterdayRows;
  }

  return rows.filter((row) => row.trade_date === today);
}

export function findTodayDirectionSetRow(
  todayRows: AsianDirectionLogEntry[],
): AsianDirectionLogEntry | null {
  return todayRows.find((row) => DIRECTION_SET_ACTIONS.has(row.action)) ?? null;
}

export function findTodaySkipRow(todayRows: AsianDirectionLogEntry[]): AsianDirectionLogEntry | null {
  return todayRows.find((row) => SKIP_ACTIONS.has(row.action)) ?? null;
}

export function hasTodayAsianCloseOnly(todayRows: AsianDirectionLogEntry[]): boolean {
  if (!todayRows.length) return false;
  const hasClose = todayRows.some((row) => row.action === 'ASIAN_CLOSE');
  const hasDirectionOrSkip = todayRows.some(
    (row) => DIRECTION_SET_ACTIONS.has(row.action) || SKIP_ACTIONS.has(row.action),
  );
  return hasClose && !hasDirectionOrSkip;
}

function directionFromRow(row: AsianDirectionLogEntry): 'long' | 'short' | null {
  if (row.direction_set === 'long' || row.direction_set === 'short') return row.direction_set;
  if (row.action === 'SET_LONG') return 'long';
  if (row.action === 'SET_SHORT') return 'short';
  return null;
}

export function buildAsianVerdict(
  detectionRows: AsianSessionDetection[],
  _amdState: AmdState | null,
): AsianSessionVerdict {
  if (isForexWeekendClosed()) {
    return {
      headline: 'WEEKEND',
      subline: 'Markets closed',
      tone: 'pending',
    };
  }

  const todayRows = findTodayChecks(detectionRows);
  const active = findTodayActiveDetection(detectionRows);

  if (active) {
    const condLabel = active.condition_fired ?? '?';
    const dirLabel = active.direction_set === 'long' ? 'LONG' : 'SHORT';
    const timeLabel = active.condition_check_time;
    const shiftedLabel = active.prior_amd_shifted ? 'AMD_SHIFTED prior' : 'Non-SHIFTED prior';
    const sizeLabel = active.size_multiplier === 1.0 ? '1.0×' : '0.75×';
    return {
      headline: `${dirLabel} — Condition ${condLabel} @ ${timeLabel}`,
      subline: `${shiftedLabel} · Size ${sizeLabel}`,
      tone: 'complete',
    };
  }

  if (todayRows.some((row) => row.action === 'SKIPPED_MANUAL_MODE')) {
    return {
      headline: 'Manual mode — detection skipped',
      subline: 'Direction set manually via dashboard',
      tone: 'skipped',
    };
  }

  if (allCronsFiredToday(todayRows)) {
    return {
      headline: 'No pattern detected today',
      subline: 'All 4 conditions checked — no sustained direction found',
      tone: 'skipped',
    };
  }

  if (todayRows.length > 0) {
    const firedTimes = todayRows.map((row) => row.condition_check_time);
    const nextCron = nextPendingCron(firedTimes);
    return {
      headline: 'Monitoring in progress',
      subline: nextCron ? `Next check: ${nextCron}` : 'Awaiting final checks',
      tone: 'active',
    };
  }

  const nowHour = new Date().getUTCHours();
  if (nowHour >= 8) {
    return {
      headline: 'No pattern detected today',
      subline: 'Asian session closed without a sustained directional signal',
      tone: 'skipped',
    };
  }

  return {
    headline: 'Asian session open',
    subline: 'First check at 01:00 UTC — Condition C',
    tone: 'pending',
  };
}

/** Prior-day direction row — only for explicit stale labeling, never as today's verdict. */
export function findStalePriorDirectionRow(
  asianRows: AsianDirectionLogEntry[],
): AsianDirectionLogEntry | null {
  const today = todayUtcDate();
  return (
    asianRows.find(
      (row) =>
        row.trade_date !== today &&
        (row.action === 'SET_LONG' || row.action === 'SET_SHORT' || row.action === 'NO_CHANGE'),
    ) ?? null
  );
}

export function formatStaleDirectionLabel(row: AsianDirectionLogEntry): string {
  const dir = directionFromRow(row);
  const label = dir?.toUpperCase() ?? row.action;
  return `${label} (stale — from ${row.trade_date})`;
}

export function resolveTodayAsianContextRow(
  todayRows: AsianDirectionLogEntry[],
  amdState: AmdState | null,
): AsianDirectionLogEntry | null {
  return (
    findTodayDirectionSetRow(todayRows) ??
    findTodaySkipRow(todayRows) ??
    todayRows.find((row) => row.action === 'ASIAN_CLOSE') ??
    null
  );
}

export function resolveTodayAmdTag(
  todayRows: AsianDirectionLogEntry[],
  amdState: AmdState | null,
): string | null {
  const contextRow = resolveTodayAsianContextRow(todayRows, amdState);
  return contextRow?.amd_tag ?? amdState?.amd_tag ?? null;
}
