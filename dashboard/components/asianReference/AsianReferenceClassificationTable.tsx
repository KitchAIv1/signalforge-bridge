'use client';

import {
  EnumChip,
  ReferenceTable,
  SectionHeading,
  TD,
  TH,
} from '@/components/asianReference/AsianReferencePrimitives';

const CLASSIFICATION_ROWS = [
  {
    label: 'CLEAN_UP',
    tone: 'emerald',
    threshold: '>=5 bullish H1 candles, >=12 net pips, directionality >=0.300, net direction UP',
    meaning: 'Asian session moved with enough one-way pressure to qualify as a clean upside drift.',
  },
  {
    label: 'CLEAN_DOWN',
    tone: 'red',
    threshold: '>=5 bearish H1 candles, >=12 net pips, directionality >=0.300, net direction DOWN',
    meaning: 'Asian session moved with enough one-way pressure to qualify as a clean downside drift.',
  },
  {
    label: 'RANGING',
    tone: 'slate',
    threshold: 'Any session that fails the clean-trend thresholds',
    meaning: 'Treat the Asian session as mixed or range-bound for research and review.',
  },
] as const;

const METRIC_ROWS = [
  ['H1 candle count', 'Counts bullish and bearish hourly candles during the Asian window.'],
  ['Net move pips', 'Absolute move from first Asian open to final Asian close.'],
  ['Gross range pips', 'High-low range across the full Asian candle set.'],
  ['Directionality ratio', 'net_move_pips / gross_range_pips, rounded to three decimals.'],
] as const;

function MetricGrid() {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {METRIC_ROWS.map(([metricName, metricMeaning]) => (
        <div
          key={metricName}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50"
        >
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{metricName}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{metricMeaning}</p>
        </div>
      ))}
    </div>
  );
}

export function AsianReferenceClassificationTable() {
  return (
    <section>
      <SectionHeading eyebrow="Classification" title="Clean Asian Trend Labels">
        These labels are research structure labels. They explain Asian session shape; they do not directly fire trades.
      </SectionHeading>
      <ReferenceTable>
        <thead>
          <tr>
            <TH>Label</TH>
            <TH>Threshold</TH>
            <TH>Meaning</TH>
          </tr>
        </thead>
        <tbody>
          {CLASSIFICATION_ROWS.map((classificationRow) => (
            <tr key={classificationRow.label}>
              <TD>
                <EnumChip tone={classificationRow.tone}>{classificationRow.label}</EnumChip>
              </TD>
              <TD className="font-mono text-[11px]">{classificationRow.threshold}</TD>
              <TD>{classificationRow.meaning}</TD>
            </tr>
          ))}
        </tbody>
      </ReferenceTable>
      <MetricGrid />
    </section>
  );
}
