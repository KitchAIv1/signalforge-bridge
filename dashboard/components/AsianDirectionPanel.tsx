'use client';

import { useAsianDirectionLog } from '@/hooks/useAsianDirectionLog';
import type { AsianDirectionLogEntry } from '@/lib/fetchAsianDirectionLog';
import { amdTagColor } from '@/lib/amdPanelFormatters';
import { AmdIntelStatTile } from '@/components/AmdIntelStatTile';

function formatLastSetUtc(triggeredAt: string | null): string {
  if (!triggeredAt) return 'Last set: —';
  const stamp = new Date(triggeredAt);
  const hours = stamp.getUTCHours().toString().padStart(2, '0');
  const mins = stamp.getUTCMinutes().toString().padStart(2, '0');
  return `Last set: ${hours}:${mins} UTC`;
}

function priorD1Tone(direction: string | null): string {
  if (direction === 'BULLISH') return 'text-emerald-600 dark:text-emerald-400';
  if (direction === 'BEARISH') return 'text-red-600 dark:text-red-400';
  return 'text-slate-500 dark:text-slate-400';
}

function directionSetTone(direction: string | null): string {
  if (direction === 'long') return 'text-emerald-600 dark:text-emerald-400';
  if (direction === 'short') return 'text-red-600 dark:text-red-400';
  return 'text-slate-500 dark:text-slate-400';
}

function directionSetLabel(direction: string | null): string {
  if (direction === 'long') return 'LONG';
  if (direction === 'short') return 'SHORT';
  return '—';
}

function actionBadgeTone(action: string): string {
  if (action === 'SET_LONG') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (action === 'SET_SHORT') return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
  if (action === 'NO_CHANGE') return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
}

function sessionResultTone(result: string | null): string {
  if (result === 'CLEAN_UP') return 'text-emerald-600 dark:text-emerald-400';
  if (result === 'CLEAN_DOWN') return 'text-red-600 dark:text-red-400';
  if (result === 'RANGING') return 'text-slate-500 dark:text-slate-400';
  return 'text-slate-400 dark:text-slate-500';
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function findTodayRow(logRows: AsianDirectionLogEntry[]): AsianDirectionLogEntry | null {
  const todayUtc = todayUtcDate();
  return logRows.find((row) => row.trade_date === todayUtc) ?? null;
}

function AsianDirectionLoading() {
  return (
    <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-sm text-slate-500 dark:text-slate-300">
      Loading Asian direction log…
    </div>
  );
}

function AsianDirectionError({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
      Asian Direction: {message}
    </div>
  );
}

export function AsianDirectionPanel() {
  const { logRows, loading, error } = useAsianDirectionLog();

  if (loading) return <AsianDirectionLoading />;
  if (error) return <AsianDirectionError message={error} />;

  const todayRow = findTodayRow(logRows);
  const lastTriggered = logRows[0]?.triggered_at ?? null;

  return (
    <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-300">
          Asian Direction
        </p>
        <span className="text-xs text-slate-500 dark:text-slate-300">
          {formatLastSetUtc(lastTriggered)}
        </span>
      </div>

      {logRows.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No direction sets recorded yet</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mb-3">
            <AmdIntelStatTile
              caption="AMD Tag"
              value={
                <span className={amdTagColor(todayRow?.amd_tag ?? null)}>
                  {todayRow?.amd_tag ?? '—'}
                </span>
              }
            />
            <AmdIntelStatTile
              caption="Prior D1"
              value={todayRow?.prior_d1_direction ?? '—'}
              accentClassName={priorD1Tone(todayRow?.prior_d1_direction ?? null)}
            />
            <AmdIntelStatTile
              caption="Direction Set"
              value={directionSetLabel(todayRow?.direction_set ?? null)}
              accentClassName={directionSetTone(todayRow?.direction_set ?? null)}
            />
            <AmdIntelStatTile
              caption="Action"
              value={
                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${actionBadgeTone(todayRow?.action ?? '')}`}
                >
                  {todayRow?.action ?? '—'}
                </span>
              }
            />
          </div>

          <p className="text-xs italic text-slate-600 dark:text-slate-300 mb-3">
            Advisory — auto-sets omega_direction on AMD_SHIFTED days at 21:00 UTC
          </p>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">AMD Tag</th>
                  <th className="py-2 pr-3 font-medium">D1</th>
                  <th className="py-2 pr-3 font-medium">Set</th>
                  <th className="py-2 pr-3 font-medium">Action</th>
                  <th className="py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {logRows.map((row) => (
                  <tr
                    key={`${row.trade_date}-${row.created_at}`}
                    className="border-b border-slate-100 dark:border-slate-800"
                  >
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{row.trade_date}</td>
                    <td className={`py-2 pr-3 font-medium ${amdTagColor(row.amd_tag)}`}>
                      {row.amd_tag ?? '—'}
                    </td>
                    <td className={`py-2 pr-3 ${priorD1Tone(row.prior_d1_direction)}`}>
                      {row.prior_d1_direction ?? '—'}
                    </td>
                    <td className={`py-2 pr-3 ${directionSetTone(row.direction_set)}`}>
                      {directionSetLabel(row.direction_set)}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`rounded px-1.5 py-0.5 font-semibold ${actionBadgeTone(row.action)}`}>
                        {row.action}
                      </span>
                    </td>
                    <td className={`py-2 ${sessionResultTone(row.asian_session_result)}`}>
                      {row.asian_session_result ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
