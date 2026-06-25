'use client';

import type { AsianSessionDetection } from '@/lib/directionDecisionTypes';
import { formatAsianNetPips } from '@/lib/asianSessionPageHelpers';

function isInsufficientCandles(row: AsianSessionDetection): boolean {
  if (row.action === 'FETCH_INSUFFICIENT_CANDLES') return true;
  const message = row.error_message?.toLowerCase() ?? '';
  return message.includes('insufficient');
}

type AsianSessionCheckStatusProps = {
  row: AsianSessionDetection | undefined;
  cronTime: string;
  now: Date;
  pendingLabel?: string;
};

function cronMinutes(cronTime: string): number {
  const [hourText, minuteText] = cronTime.split(':');
  return Number(hourText) * 60 + Number(minuteText);
}

function isAsianSessionOpen(now: Date): boolean {
  return now.getUTCHours() < 8;
}

function isCronPending(
  cronTime: string,
  checkRow: AsianSessionDetection | undefined,
  now: Date,
): boolean {
  if (checkRow) return false;
  if (!isAsianSessionOpen(now)) return false;
  return cronMinutes(cronTime) >= cronMinutes('01:00');
}

function isPriorNightPending(cronTime: string, checkRow: AsianSessionDetection | undefined, now: Date): boolean {
  if (checkRow || cronTime !== '21:10') return false;
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  return hour < 21 || (hour === 21 && minute < 10);
}

export function AsianSessionCheckStatus({
  row,
  cronTime,
  now,
  pendingLabel = 'Pending…',
}: AsianSessionCheckStatusProps) {
  if (!row && isPriorNightPending(cronTime, row, now)) {
    return <span className="text-slate-400">{pendingLabel}</span>;
  }
  if (!row && isCronPending(cronTime, row, now)) {
    return <span className="text-slate-400">{pendingLabel}</span>;
  }
  if (!row) {
    return <span className="text-slate-500">No check</span>;
  }
  if (row.action === 'SET_LONG') {
    return (
      <span className="text-green-600 dark:text-green-400">
        ↑ LONG SET · {formatAsianNetPips(row.detection_net_pips)} · bar {row.detection_bar ?? '—'}
      </span>
    );
  }
  if (row.action === 'SET_SHORT') {
    return (
      <span className="text-red-600 dark:text-red-400">
        ↓ SHORT SET · {formatAsianNetPips(row.detection_net_pips)} · bar {row.detection_bar ?? '—'}
      </span>
    );
  }
  if (row.action === 'ALREADY_SET') {
    return <span className="text-slate-500">Direction already set</span>;
  }
  if (row.action === 'SKIPPED_MANUAL_MODE') {
    return <span className="text-amber-600 dark:text-amber-400">Manual mode</span>;
  }
  if (isInsufficientCandles(row)) {
    return (
      <span className="text-amber-600 dark:text-amber-400">
        Insufficient candles · {row.error_message ?? '—'}
      </span>
    );
  }
  if (row.action === 'NO_DETECTION') {
    return <span className="text-slate-500">NO DETECTION · {row.candle_count ?? '—'} bars</span>;
  }
  if (row.action === 'D1_FALLBACK') {
    return (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        D1 fallback — direction set
      </span>
    );
  }
  if (row.action.startsWith('D1_FALLBACK_SKIPPED')) {
    return (
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
        D1 fallback — skipped
      </span>
    );
  }
  return <span className="text-slate-500">{row.action}</span>;
}
