'use client';

import { useUpcomingNewsEvents }
  from '@/hooks/useUpcomingNewsEvents';
import type { NewsEventRow }
  from '@/lib/types';

function minutesUntil(iso: string): number {
  return Math.round(
    (new Date(iso).getTime() - Date.now())
    / 60000
  );
}

function minutesSince(iso: string): number {
  return Math.round(
    (Date.now() - new Date(iso).getTime())
    / 60000
  );
}

function formatUtcTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getUTCHours()
    .toString().padStart(2, '0');
  const m = d.getUTCMinutes()
    .toString().padStart(2, '0');
  const day = d.getUTCDate()
    .toString().padStart(2, '0');
  const mon = d.toUTCString().slice(8, 11);
  return `${mon} ${day} ${h}:${m} UTC`;
}

function affectsAudusd(
  row: NewsEventRow
): boolean {
  return Boolean(
    row.affected_pairs?.some(p =>
      p.replace('_', '').toUpperCase()
        === 'AUDUSD'
    )
  );
}

function affectsGbpusd(
  row: NewsEventRow
): boolean {
  return Boolean(
    row.affected_pairs?.some(p =>
      p.replace('_', '').toUpperCase()
        === 'GBPUSD'
    )
  );
}

// Urgency styling for upcoming events
function urgencyBg(mins: number): string {
  if (mins <= 30)
    return 'bg-red-50 border-red-300 ' +
      'dark:bg-red-950/40 dark:border-red-700';
  if (mins <= 120)
    return 'bg-orange-50 border-orange-300 ' +
      'dark:bg-orange-950/40 ' +
      'dark:border-orange-700';
  if (mins <= 360)
    return 'bg-yellow-50 border-yellow-200 ' +
      'dark:bg-yellow-950/30 ' +
      'dark:border-yellow-700';
  return 'bg-slate-50 border-slate-200 ' +
    'dark:bg-slate-800/50 ' +
    'dark:border-slate-700';
}

function urgencyText(mins: number): string {
  if (mins <= 30)
    return 'text-red-700 dark:text-red-400';
  if (mins <= 120)
    return 'text-orange-700 dark:text-orange-400';
  if (mins <= 360)
    return 'text-yellow-700 dark:text-yellow-500';
  return 'text-slate-600 dark:text-slate-300';
}

function timeLabel(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function ImpactDot({
  impact,
}: {
  impact: string | null | undefined;
}) {
  const color =
    impact === 'high'
      ? 'bg-red-500'
      : impact === 'medium'
        ? 'bg-yellow-400'
        : 'bg-slate-300';
  return (
    <span
      className={
        `inline-block h-2 w-2 rounded-full ` +
        color
      }
    />
  );
}

function PairBadge({ label }: { label: string }) {
  return (
    <span className="rounded bg-blue-100 px-1 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
      {label}
    </span>
  );
}

function UpcomingEventCard({
  event,
}: {
  event: NewsEventRow;
}) {
  const mins = minutesUntil(
    event.event_datetime_utc
  );
  const isAud = affectsAudusd(event);
  const isGbp = affectsGbpusd(event);

  return (
    <div
      className={
        `flex items-start gap-2 rounded-lg ` +
        `border px-3 py-2 ` +
        urgencyBg(mins)
      }
    >
      <ImpactDot impact={event.impact} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={
              `text-xs font-semibold ` +
              urgencyText(mins)
            }
          >
            {event.event_name}
          </span>
          {isAud && <PairBadge label="AUD/USD" />}
          {isGbp && <PairBadge label="GBP/USD" />}
          {event.pre_event_action === 'BLOCK' && (
            <span className="rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
              BLOCK
            </span>
          )}
          {event.pre_event_action === 'REDUCE' && (
            <span className="rounded bg-yellow-100 px-1 py-0.5 text-[10px] font-semibold text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400">
              REDUCE
            </span>
          )}
        </div>
        <div
          className={
            `mt-0.5 text-[11px] ` +
            urgencyText(mins)
          }
        >
          {formatUtcTime(event.event_datetime_utc)}
          {' · '}
          <span className="font-medium">
            {timeLabel(mins)} away
          </span>
        </div>
      </div>
    </div>
  );
}

function RecentEventCard({
  event,
}: {
  event: NewsEventRow;
}) {
  const mins = minutesSince(
    event.event_datetime_utc
  );
  const isAud = affectsAudusd(event);
  const isGbp = affectsGbpusd(event);
  const dir = event.post_event_direction;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 opacity-75 dark:border-slate-700 dark:bg-slate-800/30">
      <ImpactDot impact={event.impact} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {event.event_name}
          </span>
          {isAud && <PairBadge label="AUD/USD" />}
          {isGbp && <PairBadge label="GBP/USD" />}
          {dir && (
            <span
              className={
                `rounded px-1 py-0.5 ` +
                `text-[10px] font-semibold ` +
                (dir === 'long'
                  ? 'bg-green-100 text-green-700 ' +
                    'dark:bg-green-900/40 ' +
                    'dark:text-green-400'
                  : 'bg-red-100 text-red-700 ' +
                    'dark:bg-red-900/40 ' +
                    'dark:text-red-400')
              }
            >
              {dir.toUpperCase()}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
          {formatUtcTime(event.event_datetime_utc)}
          {' · '}
          {timeLabel(mins)} ago
        </div>
      </div>
    </div>
  );
}

export function NewsEventStrip() {
  const { upcoming, recent, isLoading } =
    useUpcomingNewsEvents();

  const hasContent =
    upcoming.length > 0 || recent.length > 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          News Events
        </p>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">
          Next 7 days · Last 6h
        </span>
      </div>

      {isLoading && (
        <p className="text-xs text-slate-400">
          Loading…
        </p>
      )}

      {!isLoading && !hasContent && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          No scheduled news events in the
          next 7 days.
        </p>
      )}

      {!isLoading && hasContent && (
        <div className="space-y-1.5">
          {recent.length > 0 && (
            <>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Recent
              </p>
              {recent.map(e => (
                <RecentEventCard
                  key={e.id}
                  event={e}
                />
              ))}
            </>
          )}
          {upcoming.length > 0 && (
            <>
              {recent.length > 0 && (
                <p className="pt-1 text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Upcoming
                </p>
              )}
              {upcoming.map(e => (
                <UpcomingEventCard
                  key={e.id}
                  event={e}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
