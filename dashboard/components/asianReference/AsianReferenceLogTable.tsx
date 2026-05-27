'use client';

import {
  EnumChip,
  ReferenceTable,
  SectionHeading,
  TD,
  TH,
} from '@/components/asianReference/AsianReferencePrimitives';

const LOG_ACTION_ROWS = [
  {
    action: 'SET_LONG',
    tone: 'emerald',
    source: 'DIRECTION_SET',
    meaning: 'ASIAN direction changed to long for the active session.',
  },
  {
    action: 'SET_SHORT',
    tone: 'red',
    source: 'DIRECTION_SET',
    meaning: 'ASIAN direction changed to short for the active session.',
  },
  {
    action: 'NO_CHANGE',
    tone: 'slate',
    source: 'DIRECTION_SET',
    meaning: 'Direction was already correct; the valid-until window was refreshed.',
  },
  {
    action: 'SKIPPED_NOT_SHIFTED',
    tone: 'amber',
    source: 'DIRECTION_SET',
    meaning: 'AMD context was not shifted, so ASIAN direction automation stayed inactive.',
  },
  {
    action: 'SKIPPED_NO_AMD',
    tone: 'amber',
    source: 'DIRECTION_SET',
    meaning: 'No AMD state was available for the lookup date.',
  },
  {
    action: 'SKIPPED_NO_D1',
    tone: 'amber',
    source: 'DIRECTION_SET',
    meaning: 'Prior D1 candle could not be fetched, so no direction was set.',
  },
  {
    action: 'ASIAN_CLOSE',
    tone: 'sky',
    source: 'ASIAN_CLOSE',
    meaning: '08:00 UTC close sweep ran for open Omega positions.',
  },
] as const;

export function AsianReferenceLogTable() {
  return (
    <section>
      <SectionHeading eyebrow="Logs" title="Action Codes In The Activity Panel">
        The panel reads persisted rows from asian_direction_log and compresses multiple runs into one visible row per date.
      </SectionHeading>
      <ReferenceTable>
        <thead>
          <tr>
            <TH>Action</TH>
            <TH>Trigger</TH>
            <TH>Operator Meaning</TH>
          </tr>
        </thead>
        <tbody>
          {LOG_ACTION_ROWS.map((logActionRow) => (
            <tr key={logActionRow.action}>
              <TD>
                <EnumChip tone={logActionRow.tone}>{logActionRow.action}</EnumChip>
              </TD>
              <TD className="font-mono text-[11px]">{logActionRow.source}</TD>
              <TD>{logActionRow.meaning}</TD>
            </tr>
          ))}
        </tbody>
      </ReferenceTable>
      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        Scheduled rows occur around 21:00 UTC. Startup rows are catch-up or service-start checks and should not be confused with the primary scheduled set.
      </p>
    </section>
  );
}
