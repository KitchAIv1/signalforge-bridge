'use client';

import { getRColor, getRValue } from '@/lib/pnlCalendarFormat';
import type { DaySummary } from '@/lib/pnlCalendarTypes';

interface PnlCalendarSummaryStripProps {
  totalR: number;
  totalDollars: number;
  hasNullDollarsGlobal: boolean;
  totalTrades: number;
  globalWinRate: number;
  bestDay: DaySummary | null;
  worstDay: DaySummary | null;
}

export function PnlCalendarSummaryStrip({
  totalR,
  totalDollars,
  hasNullDollarsGlobal,
  totalTrades,
  globalWinRate,
  bestDay,
  worstDay,
}: PnlCalendarSummaryStripProps) {
  const stats = [
    { label: 'Total R', value: getRValue(totalR), color: getRColor(totalR), mono: true },
    {
      label: 'Total $',
      value: `${totalDollars >= 0 ? '+' : ''}$${Math.abs(totalDollars).toFixed(0)}${hasNullDollarsGlobal ? '*' : ''}`,
      color: getRColor(totalDollars),
      mono: true,
    },
    { label: 'Trades', value: totalTrades, color: '#94a3b8', mono: false },
    { label: 'Win Rate', value: `${globalWinRate}%`, color: '#94a3b8', mono: false },
    {
      label: 'Best Day',
      value: bestDay ? getRValue(bestDay.netR) : '—',
      color: '#10b981',
      mono: true,
    },
    {
      label: 'Worst Day',
      value: worstDay ? getRValue(worstDay.netR) : '—',
      color: '#f43f5e',
      mono: true,
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
      {stats.map((stat) => (
        <div
          key={stat.label}
          style={{
            background: '#0e1420',
            border: '1px solid #1e2d3d',
            borderRadius: 10,
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: 11, color: '#3d5470', marginBottom: 6 }}>{stat.label}</div>
          <div
            style={{
              fontSize: 20,
              fontFamily: stat.mono ? "'Roboto Mono', monospace" : "'DM Sans', sans-serif",
              fontWeight: 700,
              color: stat.color,
              letterSpacing: stat.mono ? '-0.5px' : 0,
            }}
          >
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}
