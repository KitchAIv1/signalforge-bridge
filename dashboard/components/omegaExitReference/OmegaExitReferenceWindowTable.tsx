'use client';

import {
  EnumChip,
  ReferenceTable,
  SectionHeading,
  TD,
  TH,
} from '@/components/omegaExitReference/OmegaExitReferencePrimitives';

const WINDOW_ROWS = [
  {
    window: 'ASIAN',
    expiryHour: '08:00 UTC',
    range: '21:00 → 08:00 UTC',
    setBy: 'AsianDirectionService (AMD_SHIFTED)',
    tone: 'emerald' as const,
  },
  {
    window: 'AMD',
    expiryHour: '14:00 UTC',
    range: 'Tag entry → 14:00 UTC',
    setBy: 'AmdDetector / auto_direction (10:31 UTC)',
    tone: 'sky' as const,
  },
] as const;

const BLOCK_ROWS = [
  {
    check: 'isOmegaWindowActive()',
    result: 'BLOCKED if omega_direction_valid_until expired or missing',
    blockReason: 'OMEGA_WINDOW_EXPIRED',
  },
  {
    check: 'Opposing position open',
    result: 'BLOCKED until opposing leg closed',
    blockReason: 'OMEGA_OPPOSING_POSITION',
  },
  {
    check: 'Paused engines list',
    result: 'BLOCKED if omega in paused_engines',
    blockReason: 'engine_paused',
  },
] as const;

export function OmegaExitReferenceWindowTable() {
  return (
    <section>
      <SectionHeading eyebrow="Entry Windows" title="omega_direction_valid_until Gate">
        Window expiry is an entry gate, not an automatic exit. Open trades still exit via trail,
        max_hold, or session sweep. Shown on Activity Omega window indicator above this panel.
      </SectionHeading>
      <ReferenceTable>
        <thead>
          <tr>
            <TH>Window</TH>
            <TH>Valid Until</TH>
            <TH>Active Range</TH>
            <TH>Set By</TH>
          </tr>
        </thead>
        <tbody>
          {WINDOW_ROWS.map((windowRow) => (
            <tr key={windowRow.window}>
              <TD>
                <EnumChip tone={windowRow.tone}>{windowRow.window}</EnumChip>
              </TD>
              <TD className="font-mono">{windowRow.expiryHour}</TD>
              <TD>{windowRow.range}</TD>
              <TD>{windowRow.setBy}</TD>
            </tr>
          ))}
        </tbody>
      </ReferenceTable>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Entry Blocks (signalRouter)
        </p>
        <ReferenceTable>
          <thead>
            <tr>
              <TH>Check</TH>
              <TH>Result</TH>
              <TH>block_reason</TH>
            </tr>
          </thead>
          <tbody>
            {BLOCK_ROWS.map((blockRow) => (
              <tr key={blockRow.check}>
                <TD className="font-mono text-[11px]">{blockRow.check}</TD>
                <TD>{blockRow.result}</TD>
                <TD>
                  <EnumChip tone="amber">{blockRow.blockReason}</EnumChip>
                </TD>
              </tr>
            ))}
          </tbody>
        </ReferenceTable>
      </div>
    </section>
  );
}
