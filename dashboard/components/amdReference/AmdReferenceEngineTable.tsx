'use client';

const TH = ({ children }: { children: React.ReactNode }) => (
  <th className="px-3 py-2 text-left font-medium">{children}</th>
);

const TD = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <td className={`px-3 py-2 align-top ${className}`}>{children}</td>
);

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
      {children}
    </h3>
  );
}

const ENGINE_ROWS = [
  { tag: 'AMD_TEXTBOOK',             entry: '12:00', exit: '13:00', strategy: 'S0', gate: 'None',    trail: '2.5 pip', sl: '15 pip', note: 'Gate kept: -7% pips but +11pp win rate' },
  { tag: 'AMD_COMPRESSION_BREAKOUT', entry: '10:31', exit: '16:00', strategy: 'S0', gate: 'None',    trail: '2.5 pip', sl: '15 pip', note: 'Gate removed: was -25% damage' },
  { tag: 'AMD_FAILED',               entry: '11:00', exit: '16:00', strategy: 'S0', gate: 'None',    trail: '2.5 pip', sl: '15 pip', note: 'Gate removed: was -90% damage' },
  { tag: 'AMD_SHIFTED',              entry: '12:00', exit: '16:00', strategy: 'S0', gate: 'None',    trail: '2.5 pip', sl: '15 pip', note: 'Gate removed: was -55% damage' },
  { tag: 'AMD_NONE',                 entry: '10:31', exit: '11:00', strategy: 'S1', gate: 'H11 UTC', trail: '2.5 pip', sl: '15 pip', note: 'Gate kept: +67% improvement' },
  { tag: 'INSUFFICIENT_DATA',        entry: '—',     exit: '—',     strategy: '—',  gate: '—',       trail: '—',       sl: '—',      note: 'No trade' },
] as const;

const BACKTEST_ROWS = [
  { tag: 'AMD_TEXTBOOK',
    s0: '5.5p',
    s1: '5.1p',
    decision: 'Keep gate',
    winRate: '68.4%',
    note: '-7% pips, +11pp win rate' },
  { tag: 'AMD_COMPRESSION_BREAKOUT',
    s0: '8.8p',
    s1: '6.7p',
    decision: 'Removed gate',
    winRate: '75.5%',
    note: '-25% damage with gate' },
  { tag: 'AMD_FAILED',
    s0: '7.0p (D1)',
    s1: '0.7p',
    decision: 'Removed gate',
    winRate: '44.8%',
    note: '-90% damage with gate' },
  { tag: 'AMD_SHIFTED',
    s0: '4.05p',
    s1: '1.83p',
    decision: 'Removed gate',
    winRate: '63.2%',
    note: 'S0 optimal — 86.5% win, 39.8% peak capture, 2.5p trail' },
  { tag: 'AMD_NONE',
    s0: '1.7p',
    s1: '2.8p',
    decision: 'Keep gate',
    winRate: '52.9%',
    note: '+67% improvement with gate' },
] as const;

const SYSTEM_GATES: Array<{ number: string; gate: string; detail?: string }> = [
  { number: '1', gate: 'AMD_DISTRIBUTION_ENABLED = true' },
  { number: '2', gate: "Today's amd_state row exists" },
  { number: '3', gate: 'auto_direction = long or short (not neutral)' },
  {
    number: '4b',
    gate: 'Asian close bias filter',
    detail:
      'Controlled via bridge_config amd_asian_close_filter_enabled (default off). When on: if asian_close_bias_signal opposes auto_direction → BLOCKED (ASIAN_CLOSE_DISAGREE).',
  },
  { number: '4', gate: 'Current UTC hour within entry/exit window (isEntryWindowOpen)' },
  { number: '5', gate: 'amd_state.evaluated_at = today (not stale)' },
  { number: '6', gate: 'No trade executed today (hasExecutedToday = false)' },
  { number: '7', gate: 'bridge_engines.engine_amd.is_active = true' },
  { number: '8', gate: 'No news blackout (±90 min window)' },
];

export function AmdReferenceEngineTable() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <SectionHeading>Distribution Engine Execution</SectionHeading>
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <TH>Tag</TH>
                <TH>Entry UTC</TH>
                <TH>Hard Exit UTC</TH>
                <TH>Exit Strategy</TH>
                <TH>Time Gate</TH>
                <TH>Trail</TH>
                <TH>Hard SL</TH>
                <TH>Validation</TH>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {ENGINE_ROWS.map((row) => (
                <tr key={row.tag}>
                  <TD className="font-mono font-medium text-slate-800 dark:text-slate-200">{row.tag}</TD>
                  <TD className="font-mono text-slate-600 dark:text-slate-300">{row.entry}</TD>
                  <TD className="font-mono text-slate-600 dark:text-slate-300">{row.exit}</TD>
                  <TD className="font-mono font-medium text-slate-700 dark:text-slate-200">{row.strategy}</TD>
                  <TD className="text-slate-600 dark:text-slate-300">{row.gate}</TD>
                  <TD className="text-slate-600 dark:text-slate-300">{row.trail}</TD>
                  <TD className="text-slate-600 dark:text-slate-300">{row.sl}</TD>
                  <TD className="text-slate-500 dark:text-slate-400">{row.note}</TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <SectionHeading>Exit Strategy Backtest (272 days)</SectionHeading>
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <TH>Tag</TH>
                <TH>S0 No Gate</TH>
                <TH>S1 With Gate</TH>
                <TH>Decision</TH>
                <TH>Win Confirmation</TH>
                <TH>Note</TH>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {BACKTEST_ROWS.map((row) => (
                <tr key={row.tag}>
                  <TD className="font-mono font-medium text-slate-800 dark:text-slate-200">{row.tag}</TD>
                  <TD className="font-mono text-slate-600 dark:text-slate-300">{row.s0}</TD>
                  <TD className="font-mono text-slate-600 dark:text-slate-300">{row.s1}</TD>
                  <TD className="font-medium text-slate-700 dark:text-slate-200">{row.decision}</TD>
                  <TD className="text-slate-600 dark:text-slate-300">{row.winRate}</TD>
                  <TD className="text-slate-500 dark:text-slate-400">{row.note}</TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <SectionHeading>System Gates — All Must Pass for Trade to Fire</SectionHeading>
        <ol className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
          {SYSTEM_GATES.map((gateEntry) => (
            <li key={gateEntry.number} className="flex gap-2 py-0.5 text-xs text-slate-600 dark:text-slate-300">
              <span className="w-6 flex-shrink-0 font-mono text-slate-400">{gateEntry.number}.</span>
              <span>
                <span className="font-medium">{gateEntry.gate}</span>
                {gateEntry.detail != null && (
                  <span className="mt-0.5 block text-slate-500 dark:text-slate-400">{gateEntry.detail}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
