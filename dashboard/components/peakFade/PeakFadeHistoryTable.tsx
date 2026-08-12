import type { PeakFadeTradeRow } from '@/lib/peakFadeTypes';

export function PeakFadeHistoryTable({ closedRows }: { closedRows: PeakFadeTradeRow[] }) {
  if (!closedRows.length) {
    return <p className="text-sm text-slate-500">No closed Peak Fade trades yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-500">
          <tr>
            <th className="px-2 py-2">Opened</th>
            <th className="px-2 py-2">Dir</th>
            <th className="px-2 py-2">Broker</th>
            <th className="px-2 py-2">Entry</th>
            <th className="px-2 py-2">Exit</th>
            <th className="px-2 py-2">Pips</th>
            <th className="px-2 py-2">Reason</th>
          </tr>
        </thead>
        <tbody className="text-slate-700 dark:text-slate-300">
          {closedRows.slice(0, 80).map((row) => (
            <tr key={row.id} className="border-t border-slate-200 dark:border-slate-800">
              <td className="px-2 py-2 whitespace-nowrap">
                {(row.opened_at ?? row.created_at).slice(0, 16)}
              </td>
              <td className="px-2 py-2">{row.direction}</td>
              <td className="px-2 py-2">{row.broker_id ?? '—'}</td>
              <td className="px-2 py-2">{row.entry_price}</td>
              <td className="px-2 py-2">{row.exit_price ?? '—'}</td>
              <td className="px-2 py-2">
                {row.pnl_pips_actual ?? row.pnl_pips ?? '—'}
              </td>
              <td className="px-2 py-2">{row.close_reason ?? row.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
