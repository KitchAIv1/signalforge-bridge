'use client';

import { useUpcomingNewsEvents } from '@/hooks/useUpcomingNewsEvents';

function minutesUntil(isoString: string): number {
  return Math.round((new Date(isoString).getTime() - Date.now()) / 60000);
}

function urgencyClass(minutesAway: number): string {
  if (minutesAway <= 60) return 'border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800';
  if (minutesAway <= 240)
    return 'border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800';
  return 'border-slate-200 bg-slate-50 dark:bg-slate-800/50 dark:border-slate-700';
}

function urgencyTextClass(minutesAway: number): string {
  if (minutesAway <= 60) return 'text-red-700 dark:text-red-400';
  if (minutesAway <= 240) return 'text-yellow-700 dark:text-yellow-400';
  return 'text-slate-600 dark:text-slate-300';
}

function formatEventTime(isoString: string): string {
  return new Date(isoString).toUTCString().slice(5, 22) + ' UTC';
}

export function NewsEventStrip() {
  const { events, isLoading } = useUpcomingNewsEvents();

  if (isLoading || events.length === 0) return null;

  return (
    <div className="mb-3">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Upcoming news — next 24h
      </p>
      <div className="flex flex-wrap gap-2">
        {events.map((event) => {
          const mins = minutesUntil(event.event_datetime_utc);
          const affectsOmega =
            event.affected_pairs?.includes('AUDUSD') ||
            event.affected_pairs?.includes('AUD_USD');
          return (
            <div
              key={event.id}
              className={`rounded-lg border px-3 py-1.5 text-xs ${urgencyClass(mins)}`}
            >
              <span className={`font-medium ${urgencyTextClass(mins)}`}>{event.event_name}</span>
              <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
              <span className={urgencyTextClass(mins)}>
                {formatEventTime(event.event_datetime_utc)}
              </span>
              <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
              <span className={urgencyTextClass(mins)}>
                {mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`} away
              </span>
              {affectsOmega && (
                <>
                  <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                  <span className="font-medium text-orange-600 dark:text-orange-400">
                    affects Omega
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
