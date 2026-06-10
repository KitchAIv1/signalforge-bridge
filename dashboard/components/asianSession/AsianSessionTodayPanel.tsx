'use client';

import { CRON_SCHEDULE } from '@/lib/asianDetectionDisplayHelpers';
import { AsianSessionConfidencePill } from '@/components/asianSession/AsianSessionConfidencePill';
import { formatAsianNetPips, formatAsianSizeMultiplier, formatAsianTradeDate, formatPriorBiasLabel } from '@/lib/asianSessionPageHelpers';
import type { AsianSessionDetection } from '@/lib/directionDecisionTypes';

type TodayPanelProps = {
  todayChecks: AsianSessionDetection[];
  todayRow: AsianSessionDetection | null;
};

function cronMinutes(cronTime: string): number {
  const [hourText, minuteText] = cronTime.split(':');
  return Number(hourText) * 60 + Number(minuteText);
}

function isAsianSessionOpen(now: Date): boolean {
  return now.getUTCHours() < 8;
}

function isCronPending(cronTime: string, checkRow: AsianSessionDetection | undefined, now: Date): boolean {
  if (checkRow) return false;
  if (!isAsianSessionOpen(now)) return false;
  return cronMinutes(cronTime) >= cronMinutes('01:00');
}

function isInsufficientCandles(row: AsianSessionDetection): boolean {
  const message = row.error_message?.toLowerCase() ?? '';
  return message.includes('insufficient');
}

function renderCheckStatus(row: AsianSessionDetection | undefined, cronTime: string, now: Date) {
  if (!row && isCronPending(cronTime, row, now)) {
    return <span className="text-slate-400">Pending…</span>;
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
  return <span className="text-slate-500">{row.action}</span>;
}

function resolvePriorContextRow(
  todayRow: AsianSessionDetection | null,
  todayChecks: AsianSessionDetection[],
): AsianSessionDetection | null {
  if (todayRow) return todayRow;
  return [...todayChecks].reverse().find((row) => row.prior_amd_tag != null) ?? todayChecks.at(-1) ?? null;
}

export function AsianSessionTodayPanel({ todayChecks, todayRow }: TodayPanelProps) {
  const now = new Date();
  const todayUtc = now.toISOString().slice(0, 10);
  const priorContext = resolvePriorContextRow(todayRow, todayChecks);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Today — {formatAsianTradeDate(todayUtc)}
      </div>
      <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
        {CRON_SCHEDULE.map((cron) => {
          const checkRow = todayChecks.find((row) => row.condition_check_time === cron.time);
          return (
            <div
              key={cron.time}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
            >
              <span className="w-12 font-mono text-slate-500">{cron.time}</span>
              <span className="w-14 font-medium text-slate-700 dark:text-slate-300">{cron.condition}</span>
              <span className="flex-1 min-w-[200px]">{renderCheckStatus(checkRow, cron.time, now)}</span>
              {checkRow && (checkRow.action === 'SET_LONG' || checkRow.action === 'SET_SHORT') ? (
                <AsianSessionConfidencePill tier={checkRow.confidence_tier} />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
        Prior AMD: {priorContext?.prior_amd_tag ?? '—'} · Bias:{' '}
        {formatPriorBiasLabel(priorContext?.prior_direction_bias ?? null, priorContext?.prior_amd_tag ?? null)} ·
        Size: {formatAsianSizeMultiplier(priorContext?.size_multiplier ?? null)}
      </div>
    </div>
  );
}
