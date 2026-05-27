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

const TAG_ROWS = [
  { tag: 'AMD_TEXTBOOK',             asian: '< 35 pips + flat',                 judas: '≥ 8 pips', dist: 'Reversed (confirmed)',     live: '❌ Needs H10–H13' },
  { tag: 'AMD_COMPRESSION_BREAKOUT', asian: '< 35 pips + flat',                 judas: '≥ 8 pips', dist: 'Continued (compressed)',   live: '❌ Needs H10–H13' },
  { tag: 'AMD_FAILED',               asian: '< 35 pips + flat',                 judas: 'Fired',    dist: 'Unknown at 10:31',         live: '✅ Default flat+Judas' },
  { tag: 'AMD_SHIFTED',              asian: '< 35 non-flat OR 35–50 pips',       judas: 'Any',      dist: 'N/A',                      live: '✅ Pure Asian data' },
  { tag: 'AMD_NONE',                 asian: '≥ 50 pips',                        judas: 'Any',      dist: 'N/A',                      live: '✅ Pure Asian data' },
  { tag: 'INSUFFICIENT_DATA',        asian: '< 4 candles',                      judas: 'N/A',      dist: 'N/A',                      live: '✅ Data gap' },
] as const;

const M5_ROWS = [
  { signal: 'WITH_JUDAS',    meaning: 'First 3 M5 candles net > 1 pip in Judas direction', usedFor: 'AMD_FAILED direction when D1 RANGING' },
  { signal: 'AGAINST_JUDAS', meaning: 'First 3 M5 candles net > 1 pip against Judas',      usedFor: 'No trade — 47.1% accuracy, below coin flip' },
  { signal: 'NEUTRAL',       meaning: 'Net movement ≤ 1 pip',                               usedFor: 'No trade' },
] as const;

export function AmdReferenceTagsTable() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <SectionHeading>Tag Classification</SectionHeading>
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <TH>Tag</TH>
                <TH>Asian Condition</TH>
                <TH>Judas Condition</TH>
                <TH>Distribution</TH>
                <TH>Live at 10:31?</TH>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {TAG_ROWS.map((row) => (
                <tr key={row.tag}>
                  <TD className="font-mono font-medium text-slate-800 dark:text-slate-200">{row.tag}</TD>
                  <TD className="text-slate-600 dark:text-slate-300">{row.asian}</TD>
                  <TD className="text-slate-600 dark:text-slate-300">{row.judas}</TD>
                  <TD className="text-slate-600 dark:text-slate-300">{row.dist}</TD>
                  <TD className="text-slate-600 dark:text-slate-300">{row.live}</TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
          TEXTBOOK and COMPRESSION_BREAKOUT require H10–H13 distribution data. In live, all flat+Judas days are tagged AMD_FAILED at 10:31 UTC. amd_outcome_tag (written at 16:30) records the actual full-day result.
        </p>
      </div>

      <div>
        <SectionHeading>M5 Signal (10:00–10:30 UTC)</SectionHeading>
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <TH>Signal</TH>
                <TH>Meaning</TH>
                <TH>Used For</TH>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {M5_ROWS.map((row) => (
                <tr key={row.signal}>
                  <TD className="font-mono font-medium text-slate-800 dark:text-slate-200">{row.signal}</TD>
                  <TD className="text-slate-600 dark:text-slate-300">{row.meaning}</TD>
                  <TD className="text-slate-600 dark:text-slate-300">{row.usedFor}</TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
