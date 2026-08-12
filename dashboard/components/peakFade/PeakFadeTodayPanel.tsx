import type { PeakFadeTradeRow } from '@/lib/peakFadeTypes';

function rowLine(row: PeakFadeTradeRow): string {
  const pips = row.pnl_pips_actual ?? row.pnl_pips;
  const pipsLabel = pips == null ? '—' : `${pips}p`;
  return `${row.opened_at ?? row.created_at} ${row.direction.toUpperCase()} @ ${row.entry_price} · ${row.broker_id ?? '?'} · ${row.result ?? 'OPEN'} ${pipsLabel}`;
}

export function PeakFadeTodayPanel({
  todayRows,
  openRows,
}: {
  todayRows: PeakFadeTradeRow[];
  openRows: PeakFadeTradeRow[];
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
      <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
        Today / open
      </h2>
      {openRows.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-amber-600">Open</p>
          <ul className="mt-1 space-y-1 text-sm text-slate-700 dark:text-slate-300">
            {openRows.map((row) => (
              <li key={row.id}>{rowLine(row)}</li>
            ))}
          </ul>
        </div>
      )}
      <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">
        {todayRows.length === 0 && <li>No trades today (UTC).</li>}
        {todayRows.map((row) => (
          <li key={`t-${row.id}`}>{rowLine(row)}</li>
        ))}
      </ul>
    </section>
  );
}
