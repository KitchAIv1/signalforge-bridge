'use client';

import {
  EnumChip,
  ReferenceTable,
  SectionHeading,
  TD,
  TH,
} from '@/components/omegaExitReference/OmegaExitReferencePrimitives';

const AMD_ENGINE_ROWS = [
  {
    tag: 'AMD_NONE',
    entry: '10:31',
    hardExit: 'H11',
    strategy: 'S1',
    timeGate: 'H11 UTC',
    note: 'Only tag with time gate — +67% vs S0 in backtest',
  },
  {
    tag: 'AMD_TEXTBOOK',
    entry: '12:00',
    hardExit: 'H13',
    strategy: 'S0',
    timeGate: 'None',
    note: 'Gate kept at H13 — marginal pip loss, +11pp win rate',
  },
  {
    tag: 'AMD_COMPRESSION_BREAKOUT',
    entry: '10:31',
    hardExit: 'H16',
    strategy: 'S0',
    timeGate: 'None',
    note: 'Gate removed — was -25% damage',
  },
  {
    tag: 'AMD_FAILED',
    entry: '11:00',
    hardExit: 'H16',
    strategy: 'S0',
    timeGate: 'None',
    note: 'Gate removed — was -90% damage',
  },
  {
    tag: 'AMD_SHIFTED',
    entry: '12:00',
    hardExit: 'H16',
    strategy: 'S0',
    timeGate: 'None',
    note: 'Gate removed — S0 optimal (2.5p trail)',
  },
] as const;

const AMD_EXIT_CONSTANTS = [
  ['Hard SL', '15 pips on OANDA at entry'],
  ['Pip trail', '2.5 pips from peak (amdTrailingStopMonitor)'],
  ['Engine ID', 'engine_amd — separate from omega trail'],
  ['Omega link', 'amd_size_multiplier + auto_direction affect omega entry only'],
] as const;

export function OmegaExitReferenceAmdGateTable() {
  return (
    <section>
      <SectionHeading eyebrow="AMD Distribution" title="engine_amd Exit (Not Omega Trail)">
        AMD time gates and pip trails apply to distribution trades only. Omega uses R-trail above;
        both share AUD_USD and AMD intelligence context.
      </SectionHeading>
      <ReferenceTable>
        <thead>
          <tr>
            <TH>Tag</TH>
            <TH>Entry UTC</TH>
            <TH>Hard Exit</TH>
            <TH>Strategy</TH>
            <TH>Time Gate</TH>
            <TH>Validation Note</TH>
          </tr>
        </thead>
        <tbody>
          {AMD_ENGINE_ROWS.map((amdRow) => (
            <tr key={amdRow.tag}>
              <TD className="font-mono font-medium text-slate-800 dark:text-slate-200">{amdRow.tag}</TD>
              <TD className="font-mono">{amdRow.entry}</TD>
              <TD className="font-mono">{amdRow.hardExit}</TD>
              <TD>
                <EnumChip tone={amdRow.strategy === 'S1' ? 'amber' : 'violet'}>{amdRow.strategy}</EnumChip>
              </TD>
              <TD>{amdRow.timeGate}</TD>
              <TD className="text-slate-500 dark:text-slate-400">{amdRow.note}</TD>
            </tr>
          ))}
        </tbody>
      </ReferenceTable>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {AMD_EXIT_CONSTANTS.map(([constantLabel, constantMeaning]) => (
          <div
            key={constantLabel}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50"
          >
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{constantLabel}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{constantMeaning}</p>
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        S1 close_reason = time_gate when nowUtcHour ≥ time_gate_utc_hour. S0 closes via pip_trail or
        hard_sl_external. AMD detector at 10:31 UTC can set omega_direction (auto mode) with
        valid_until 14:00 UTC.
      </p>
    </section>
  );
}
