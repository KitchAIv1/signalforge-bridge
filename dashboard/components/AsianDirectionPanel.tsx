'use client';

import { useAsianDirectionLog } from '@/hooks/useAsianDirectionLog';
import type { AsianDirectionLogEntry } from '@/lib/fetchAsianDirectionLog';
import { amdTagColor } from '@/lib/amdPanelFormatters';
import { AmdIntelStatTile } from '@/components/AmdIntelStatTile';
import { AsianReferenceModal } from '@/components/asianReference/AsianReferenceModal';

// ─── pure display helpers ────────────────────────────────────────────────────

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

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** First match in a created_at DESC list = most recent row for today */
function findTodayRow(rows: AsianDirectionLogEntry[]): AsianDirectionLogEntry | null {
  const today = todayUtcDate();
  return rows.find((r) => r.trade_date === today) ?? null;
}

/**
 * Most recent row where a direction was actually evaluated — used for the
 * "Last set" timestamp so startup noise rows don't obscure the real 21:00 run.
 */
function findLastActionableRow(rows: AsianDirectionLogEntry[]): AsianDirectionLogEntry | null {
  return (
    rows.find((r) => r.action === 'SET_LONG' || r.action === 'SET_SHORT' || r.action === 'NO_CHANGE') ?? null
  );
}

/**
 * Collapse rows to one entry per trade_date (the most recent run for that day).
 * Rows arrive created_at DESC so first occurrence per date is already the latest.
 */
function groupByDate(rows: AsianDirectionLogEntry[]): Array<{ row: AsianDirectionLogEntry; runCount: number }> {
  const seen = new Map<string, { row: AsianDirectionLogEntry; runCount: number }>();
  for (const r of rows) {
    const entry = seen.get(r.trade_date);
    if (!entry) {
      seen.set(r.trade_date, { row: r, runCount: 1 });
    } else {
      entry.runCount += 1;
    }
  }
  return Array.from(seen.values());
}

/** Scheduled = within ±5 min of 21:00 UTC (the Asian open cron). Else Startup. */
function detectRunType(triggeredAt: string): 'Scheduled' | 'Startup' {
  const d = new Date(triggeredAt);
  const totalMins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return Math.abs(totalMins - 21 * 60) <= 5 ? 'Scheduled' : 'Startup';
}

function formatActionableTime(row: AsianDirectionLogEntry | null): string {
  if (!row) return 'No scheduled run yet';
  const d = new Date(row.triggered_at);
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  return `Set: ${hh}:${mm} UTC`;
}

// ─── skeleton states ─────────────────────────────────────────────────────────

function AsianDirectionLoading() {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-sm text-slate-500 dark:text-slate-300">
      Loading Asian direction log…
    </div>
  );
}

function AsianDirectionError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
      Asian Direction: {message}
    </div>
  );
}

// ─── panel ───────────────────────────────────────────────────────────────────

export function AsianDirectionPanel() {
  const { logRows, loading, error } = useAsianDirectionLog();

  if (loading) return <AsianDirectionLoading />;
  if (error) return <AsianDirectionError message={error} />;

  const todayRow = findTodayRow(logRows);
  const lastActionable = findLastActionableRow(logRows);
  const grouped = groupByDate(logRows);

  return (
    <div className="relative rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 px-4 py-3">
      <div className="absolute left-36 top-3">
        <AsianReferenceModal />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-300">
          Asian Direction
        </p>
        <span className="text-xs text-slate-500 dark:text-slate-300">
          {formatActionableTime(lastActionable)}
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
                <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${actionBadgeTone(todayRow?.action ?? '')}`}>
                  {todayRow?.action ?? '—'}
                </span>
              }
            />
          </div>

          <p className="text-xs italic text-slate-600 dark:text-slate-300 mb-2">
            Advisory — auto-sets omega_direction on AMD_SHIFTED days at 21:00 UTC
          </p>

          {/* fixed-height scrollable log — one row per date */}
          <div className="overflow-x-auto">
            <div className="max-h-[220px] overflow-y-auto rounded border border-slate-100 dark:border-slate-800">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-3 pl-2 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">AMD Tag</th>
                    <th className="py-2 pr-3 font-medium">Action</th>
                    <th className="py-2 font-medium">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(({ row, runCount }) => (
                    <tr
                      key={row.trade_date}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="py-2 pr-3 pl-2 text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {row.trade_date}
                        {runCount > 1 && (
                          <span className="ml-1.5 rounded bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                            {runCount} runs
                          </span>
                        )}
                      </td>
                      <td className={`py-2 pr-3 font-medium ${amdTagColor(row.amd_tag)}`}>
                        {row.amd_tag ?? '—'}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`rounded px-1.5 py-0.5 font-semibold ${actionBadgeTone(row.action)}`}>
                          {row.action}
                        </span>
                      </td>
                      <td className="py-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          detectRunType(row.triggered_at) === 'Scheduled'
                            ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            : 'bg-slate-50 text-slate-400 dark:bg-slate-900 dark:text-slate-500'
                        }`}>
                          {detectRunType(row.triggered_at)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
