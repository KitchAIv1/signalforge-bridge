'use client';

import {
  EnumChip,
  ReferenceTable,
  SectionHeading,
  TD,
  TH,
} from '@/components/omegaExitReference/OmegaExitReferencePrimitives';

const ASIAN_SCHEDULE_ROWS = [
  {
    timeUtc: '21:00',
    action: 'SET_LONG / SET_SHORT / NO_CHANGE',
    tone: 'emerald' as const,
    meaning: 'AsianDirectionService sets omega_direction on AMD_SHIFTED days from prior D1.',
  },
  {
    timeUtc: '21:00',
    action: 'SKIPPED_NOT_SHIFTED',
    tone: 'amber' as const,
    meaning: 'Non-shifted days expire direction window — ASIAN automation inactive.',
  },
  {
    timeUtc: '08:00',
    action: 'ASIAN_CLOSE',
    tone: 'violet' as const,
    meaning: 'closeAllOpenOmegaPositions() — sweeps open omega legs in current direction.',
  },
] as const;

const ASIAN_VALIDITY_ROWS = [
  ['omega_direction', 'long or short — inverted at signalRouter when omega executes'],
  ['omega_direction_valid_until', 'Next 08:00 UTC after 21:00 set (Asian window)'],
  ['Weekend fallback', 'Sunday 21:00 uses Friday amd_state row'],
  ['Log table', 'asian_direction_log — Activity panel ASIAN section'],
] as const;

export function OmegaExitReferenceAsianTable() {
  return (
    <section>
      <SectionHeading eyebrow="Asian Session" title="Direction Set + Session-End Exit">
        Asian detection sets entry bias and window expiry; the 08:00 UTC sweep is an exit mechanism
        for open Omega positions, not a trail parameter change.
      </SectionHeading>
      <ReferenceTable>
        <thead>
          <tr>
            <TH>UTC Time</TH>
            <TH>Action</TH>
            <TH>Operator Meaning</TH>
          </tr>
        </thead>
        <tbody>
          {ASIAN_SCHEDULE_ROWS.map((scheduleRow) => (
            <tr key={`${scheduleRow.timeUtc}-${scheduleRow.action}`}>
              <TD className="font-mono font-medium">{scheduleRow.timeUtc}</TD>
              <TD>
                <EnumChip tone={scheduleRow.tone}>{scheduleRow.action}</EnumChip>
              </TD>
              <TD>{scheduleRow.meaning}</TD>
            </tr>
          ))}
        </tbody>
      </ReferenceTable>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {ASIAN_VALIDITY_ROWS.map(([validityLabel, validityMeaning]) => (
          <div
            key={validityLabel}
            className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 dark:border-emerald-900/50 dark:bg-emerald-950/20"
          >
            <p className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
              {validityLabel}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{validityMeaning}</p>
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        Activity panel shows ASIAN_CLOSE at 08:00 UTC. Persisted close_reason on trades is
        direction_flip_auto_close from omegaClosePositions.
      </p>
    </section>
  );
}
