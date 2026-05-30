'use client';

const TH = ({ children }: { children: React.ReactNode }) => (
  <th className="px-3 py-2 text-left font-medium">{children}</th>
);

const TD = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <td className={`px-3 py-2 align-top ${className}`}>{children}</td>
);

const ASIAN_CLOSE_FILTER_ROWS = [
  {
    signal: 'AGREE',
    condition: 'asian_close_bias aligns with auto_direction',
    result: 'Trade fires as normal',
    accuracy: '89.9% (n=89)',
    color: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    signal: 'DISAGREE',
    condition: 'asian_close_bias opposes auto_direction',
    result: 'BLOCKED — ASIAN_CLOSE_DISAGREE',
    accuracy: '35.5% production (blocked)',
    color: 'text-red-600 dark:text-red-400',
  },
  {
    signal: 'NEUTRAL',
    condition: 'asian_close 40–60% of range',
    result: 'Fall through to auto_direction',
    accuracy: '70.8% (n=24)',
    color: 'text-slate-600 dark:text-slate-300',
  },
  {
    signal: 'NULL',
    condition: 'No hour-7 candle or compute failed',
    result: 'Fall through silently',
    accuracy: 'n/a',
    color: 'text-slate-500 dark:text-slate-400',
  },
] as const;

export function AmdReferenceAsianCloseFilterTable() {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Direction Filter Layer
      </h3>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <TH>Signal</TH>
              <TH>Condition</TH>
              <TH>Result</TH>
              <TH>Backtest Accuracy</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {ASIAN_CLOSE_FILTER_ROWS.map((row) => (
              <tr key={row.signal}>
                <TD className={`font-mono font-medium ${row.color}`}>{row.signal}</TD>
                <TD className="text-slate-600 dark:text-slate-300">{row.condition}</TD>
                <TD className="text-slate-600 dark:text-slate-300">{row.result}</TD>
                <TD className="text-slate-600 dark:text-slate-300">{row.accuracy}</TD>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
