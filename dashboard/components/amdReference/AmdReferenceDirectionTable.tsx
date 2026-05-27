'use client';

import { amdTagColor } from '@/lib/amdPanelFormatters';

const TH = ({ children }: { children: React.ReactNode }) => (
  <th className="px-3 py-2 text-left font-medium">{children}</th>
);

const TD = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <td className={`px-3 py-2 align-top ${className}`}>{children}</td>
);

type DirectionRow = {
  tag: string;
  signal: string;
  condition: string;
  direction: string;
  confidence: string;
  multiplier: string;
};

const DIRECTION_ROWS: DirectionRow[] = [
  // AMD_TEXTBOOK
  { tag: 'AMD_TEXTBOOK',
    signal: 'Judas inversion',
    condition: 'ALIGNED + strong (≥4/5)',
    direction: 'Opposite Judas',
    confidence: 'high',
    multiplier: '2.5×' },
  { tag: 'AMD_TEXTBOOK',
    signal: 'Judas inversion',
    condition: 'ALIGNED + weak (3/5)',
    direction: 'Opposite Judas',
    confidence: 'medium',
    multiplier: '1.5×' },
  { tag: 'AMD_TEXTBOOK',
    signal: 'Judas inversion',
    condition: 'CONFLICTED',
    direction: 'Opposite Judas',
    confidence: 'low',
    multiplier: '0.5×' },

  // AMD_COMPRESSION_BREAKOUT
  { tag: 'AMD_COMPRESSION_BREAKOUT',
    signal: 'Judas continuation',
    condition: 'Any',
    direction: 'Same as Judas',
    confidence: 'medium',
    multiplier: '1.5×' },

  // AMD_FAILED — Layer 1 M5 (RANGING D1 only — not TRENDING)
  { tag: 'AMD_FAILED',
    signal: 'M5 WITH_JUDAS',
    condition: 'D1 RANGING + judas ≥ 8',
    direction: 'Judas direction',
    confidence: 'medium',
    multiplier: '1.0×' },
  { tag: 'AMD_FAILED',
    signal: 'M5 AGAINST / NEUTRAL',
    condition: 'D1 RANGING',
    direction: 'neutral',
    confidence: 'low',
    multiplier: '—' },

  // AMD_FAILED — Layer 2 D1 (TRENDING D1 only — M5 ignored)
  { tag: 'AMD_FAILED',
    signal: 'D1 bias (TRENDING)',
    condition: 'D1 TRENDING + ALIGNED strong',
    direction: 'D1 direction',
    confidence: 'medium',
    multiplier: '1.75×' },
  { tag: 'AMD_FAILED',
    signal: 'D1 bias (TRENDING)',
    condition: 'D1 TRENDING + ALIGNED weak',
    direction: 'D1 direction',
    confidence: 'low',
    multiplier: '1.0×' },
  { tag: 'AMD_FAILED',
    signal: 'D1 bias (TRENDING)',
    condition: 'D1 TRENDING + CONFLICTED',
    direction: 'D1 direction',
    confidence: 'low',
    multiplier: '0.25×' },
  { tag: 'AMD_FAILED',
    signal: '—',
    condition: 'D1 RANGING + no M5',
    direction: 'neutral',
    confidence: '—',
    multiplier: '—' },

  // AMD_SHIFTED — D1 direction
  { tag: 'AMD_SHIFTED',
    signal: '7-candle D1',
    condition: 'ALIGNED + strong (≥5/7)',
    direction: 'D1 direction',
    confidence: 'medium',
    multiplier: '1.5×' },
  { tag: 'AMD_SHIFTED',
    signal: '7-candle D1',
    condition: 'ALIGNED + weak (4/7)',
    direction: 'D1 direction',
    confidence: 'low',
    multiplier: '1.0×' },
  { tag: 'AMD_SHIFTED',
    signal: '7-candle D1',
    condition: 'CONFLICTED + strong',
    direction: 'D1 direction',
    confidence: 'low',
    multiplier: '0.75×' },
  { tag: 'AMD_SHIFTED',
    signal: '7-candle D1',
    condition: 'CONFLICTED + weak',
    direction: 'D1 direction',
    confidence: 'low',
    multiplier: '0.5×' },

  // AMD_SHIFTED — RANGING fallback (data collection only, no trade)
  { tag: 'AMD_SHIFTED',
    signal: 'Asian dominance ratios',
    condition: 'RANGING D1 + judas/range < 0.20 + drift > 0.50',
    direction: 'DATA ONLY — no trade',
    confidence: '—',
    multiplier: '—' },
  { tag: 'AMD_SHIFTED',
    signal: '—',
    condition: 'RANGING D1 — no signal',
    direction: 'neutral',
    confidence: '—',
    multiplier: '—' },

  // AMD_NONE
  { tag: 'AMD_NONE',
    signal: 'Judas inversion',
    condition: 'D1 TRENDING_WEAK (3/5)',
    direction: 'Opposite Judas',
    confidence: 'low',
    multiplier: 'ALIGNED 0.75× / CONFLICTED 0.5×' },
  { tag: 'AMD_NONE',
    signal: 'D1 bias',
    condition: 'D1 TRENDING_STRONG (≥4/5)',
    direction: 'D1 direction',
    confidence: 'low',
    multiplier: 'ALIGNED 1.0× / CONFLICTED 0.25×' },
  { tag: 'AMD_NONE',
    signal: '—',
    condition: 'D1 RANGING',
    direction: 'neutral',
    confidence: '—',
    multiplier: '—' },

  // INSUFFICIENT_DATA
  { tag: 'INSUFFICIENT_DATA',
    signal: '—',
    condition: '—',
    direction: 'neutral',
    confidence: '—',
    multiplier: '—' },
];

function confidenceColor(conf: string): string {
  if (conf === 'high')   return 'text-green-600 dark:text-green-400';
  if (conf === 'medium') return 'text-yellow-600 dark:text-yellow-400';
  if (conf === 'low')    return 'text-orange-600 dark:text-orange-400';
  return 'text-slate-400 dark:text-slate-500';
}

export function AmdReferenceDirectionTable() {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Direction Logic
      </h3>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <TH>Tag</TH>
              <TH>Primary Signal</TH>
              <TH>Condition</TH>
              <TH>Direction</TH>
              <TH>Confidence</TH>
              <TH>Multiplier</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {DIRECTION_ROWS.map((row, idx) => (
              <tr key={`${row.tag}-${idx}`}>
                <TD className={`font-mono font-medium ${amdTagColor(row.tag)}`}>{row.tag}</TD>
                <TD className="text-slate-600 dark:text-slate-300">{row.signal}</TD>
                <TD className="text-slate-600 dark:text-slate-300">{row.condition}</TD>
                <TD className="font-medium text-slate-700 dark:text-slate-200">{row.direction}</TD>
                <TD className={confidenceColor(row.confidence)}>{row.confidence}</TD>
                <TD className="font-mono text-slate-600 dark:text-slate-300">{row.multiplier}</TD>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
