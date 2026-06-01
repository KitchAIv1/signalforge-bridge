// amd_outcome_tag NOT referenced
// Asian session display is scoped to today's asian_direction_log rows only.

import type { AsianDirectionLogEntry } from '@/lib/fetchAsianDirectionLog';
import type { AmdState } from '@/lib/types';
import type { AsianSessionVerdict } from '@/lib/directionDecisionTypes';
import { resolveAsianSessionPhase, todayUtcDate } from '@/lib/directionDecisionPhases';

const DIRECTION_SET_ACTIONS = new Set(['SET_LONG', 'SET_SHORT', 'NO_CHANGE']);
const SKIP_ACTIONS = new Set(['SKIPPED_NOT_SHIFTED', 'SKIPPED_NO_D1', 'SKIPPED_NO_AMD']);

export function findTodayAsianRows(rows: AsianDirectionLogEntry[]): AsianDirectionLogEntry[] {
  const today = todayUtcDate();
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
  asianRows: AsianDirectionLogEntry[],
  _amdState: AmdState | null,
): AsianSessionVerdict {
  const phase = resolveAsianSessionPhase();
  const todayRows = findTodayAsianRows(asianRows);

  if (!todayRows.length) {
    if (phase === 'pending') {
      return {
        headline: 'Pending',
        subline: 'Asian session in progress — no log rows yet',
        tone: 'pending',
      };
    }
    return {
      headline: 'No data',
      subline: 'No asian_direction_log rows for today',
      tone: 'pending',
    };
  }

  const directionRow = findTodayDirectionSetRow(todayRows);
  const direction = directionRow ? directionFromRow(directionRow) : null;
  if (direction) {
    return {
      headline: `Direction: ${direction.toUpperCase()}`,
      subline: directionRow!.reason ?? 'Prior D1 + AMD_SHIFTED overnight set',
      tone: phase === 'active' ? 'active' : 'complete',
    };
  }

  const skipRow = findTodaySkipRow(todayRows);
  if (skipRow?.action === 'SKIPPED_NOT_SHIFTED') {
    return {
      headline: 'SKIPPED — not AMD_SHIFTED',
      subline: skipRow.reason ?? 'Asian direction set runs only on AMD_SHIFTED days at 21:00 UTC',
      tone: 'skipped',
    };
  }
  if (skipRow) {
    return {
      headline: `SKIPPED — ${skipRow.action.replace('SKIPPED_', '')}`,
      subline: skipRow.reason ?? 'Direction set skipped overnight',
      tone: 'skipped',
    };
  }

  if (hasTodayAsianCloseOnly(todayRows)) {
    return {
      headline: 'No direction set',
      subline: 'Asian close logged at 08:00 UTC — awaiting 21:00 UTC direction set',
      tone: phase === 'completed' ? 'skipped' : 'pending',
    };
  }

  return {
    headline: 'Pending',
    subline: 'Awaiting overnight direction set evaluation',
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
