'use client';

import {
  EnumChip,
  ReferenceTable,
  SectionHeading,
  TD,
  TH,
} from '@/components/asianReference/AsianReferencePrimitives';

const AUTOMATION_ROWS = [
  {
    condition: 'AMD tag is AMD_SHIFTED and prior D1 is BULLISH',
    action: 'SET_LONG',
    meaning: 'Write omega_direction=long and keep it valid until the next 08:00 UTC close.',
    tone: 'emerald',
  },
  {
    condition: 'AMD tag is AMD_SHIFTED and prior D1 is BEARISH',
    action: 'SET_SHORT',
    meaning: 'Write omega_direction=short and keep it valid until the next 08:00 UTC close.',
    tone: 'red',
  },
  {
    condition: 'Target direction already matches bridge_config',
    action: 'NO_CHANGE',
    meaning: 'Do not rewrite direction, but refresh the Asian valid-until window.',
    tone: 'slate',
  },
  {
    condition: 'AMD tag is not AMD_SHIFTED',
    action: 'SKIPPED_NOT_SHIFTED',
    meaning: 'Expire direction validity immediately; ASIAN automation does not apply.',
    tone: 'amber',
  },
  {
    condition: 'Missing amd_state row or prior D1 candle',
    action: 'SKIPPED_NO_AMD / SKIPPED_NO_D1',
    meaning: 'Leave the system conservative and record the reason for operator review.',
    tone: 'amber',
  },
] as const;

export function AsianReferenceAutomationTable() {
  return (
    <section>
      <SectionHeading eyebrow="Automation" title="21:00 UTC Direction Set">
        The live service reads AMD state, checks the prior D1 candle, then writes the session direction only when the day is shifted.
      </SectionHeading>
      <ReferenceTable>
        <thead>
          <tr>
            <TH>Condition</TH>
            <TH>Action</TH>
            <TH>Operator Meaning</TH>
          </tr>
        </thead>
        <tbody>
          {AUTOMATION_ROWS.map((automationRow) => (
            <tr key={automationRow.action}>
              <TD>{automationRow.condition}</TD>
              <TD>
                <EnumChip tone={automationRow.tone}>{automationRow.action}</EnumChip>
              </TD>
              <TD>{automationRow.meaning}</TD>
            </tr>
          ))}
        </tbody>
      </ReferenceTable>
      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        Weekend fallback: Sunday 21:00 UTC uses Friday&apos;s AMD state because weekend trading days do not have fresh amd_state rows.
      </p>
    </section>
  );
}
