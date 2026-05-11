'use client';

import type { DaySummary } from '@/lib/pnlCalendarTypes';
import { getDollarValue, getRColor, getRValue } from '@/lib/pnlCalendarFormat';
import { DayDetailTradeRow } from '@/components/pnlCalendar/DayDetailTradeRow';
import { DayDetailTradeMobileBlock } from '@/components/pnlCalendar/DayDetailTradeMobileBlock';

type StatChip =
  | { label: string; val: string | number; color: string }
  | false
  | null
  | undefined;

function buildStatChips(day: DaySummary): StatChip[] {
  return [
    { label: 'Trades', val: day.tradeCount, color: '#94a3b8' },
    { label: 'Wins', val: day.wins, color: '#10b981' },
    { label: 'Losses', val: day.losses, color: '#f43f5e' },
    { label: 'Win Rate', val: `${day.winRate}%`, color: '#94a3b8' },
    day.omegaNetR !== 0 && { label: 'Omega', val: getRValue(day.omegaNetR), color: '#7c3aed' },
    day.rebuildNetR !== 0 && {
      label: 'Rebuild',
      val: getRValue(day.rebuildNetR),
      color: '#d97706',
    },
    day.longCount > 0 && {
      label: 'Long',
      val: `${day.longCount} (${getRValue(day.longNetR)})`,
      color: '#0ea5e9',
    },
    day.shortCount > 0 && {
      label: 'Short',
      val: `${day.shortCount} (${getRValue(day.shortNetR)})`,
      color: '#e879f9',
    },
  ];
}

interface DayDetailPanelProps {
  day: DaySummary;
  onDismiss: () => void;
}

export function DayDetailPanel({ day, onDismiss }: DayDetailPanelProps) {
  const dateLabel = new Date(day.date + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const sortedTrades = [...day.trades].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const chips = buildStatChips(day).filter((c): c is Exclude<StatChip, false | null | undefined> =>
    Boolean(c)
  );

  return (
    <div
      className="box-border max-w-[100vw]"
      style={{
        background: '#0e1824',
        border: '1px solid #1e2d3d',
        borderRadius: 14,
        padding: '20px',
        marginTop: 2,
      }}
    >
      <div
        className="mb-5 flex flex-col gap-4 sm:mb-5 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="min-w-0 pr-2">
          <div
            style={{
              fontSize: 13,
              color: '#4a6080',
              fontFamily: "'DM Sans', sans-serif",
              marginBottom: 4,
            }}
          >
            {dateLabel}
          </div>
          <div className="flex flex-wrap items-baseline gap-3 sm:gap-6">
            <span
              className="text-[26px] sm:text-[32px]"
              style={{
                fontFamily: "'Roboto Mono', monospace",
                fontWeight: 700,
                color: getRColor(day.netR),
                letterSpacing: '-1px',
              }}
            >
              {getRValue(day.netR)}
            </span>
            <span
              className="text-[17px] sm:text-[18px]"
              style={{
                fontFamily: "'Roboto Mono', monospace",
                color: getRColor(day.netDollars),
                opacity: 0.8,
              }}
            >
              {getDollarValue(day.netDollars, day.hasNullDollars)}
              {day.hasNullDollars && (
                <span style={{ fontSize: 11, color: '#d97706', marginLeft: 4 }}>partial</span>
              )}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-[44px] shrink-0 self-start sm:self-auto"
          style={{
            background: 'transparent',
            border: '1px solid #1e2d3d',
            borderRadius: 7,
            color: '#4a6080',
            cursor: 'pointer',
            padding: '8px 12px',
            fontSize: 13,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          ✕
        </button>
      </div>
      <div className="mb-5 flex flex-wrap gap-2.5 sm:mb-5">
        {chips.map((chip, idx) => (
          <div
            key={`${chip.label}-${idx}`}
            style={{
              background: '#111827',
              border: '1px solid #1e2d3d',
              borderRadius: 7,
              padding: '5px 12px',
              display: 'flex',
              gap: 7,
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 11, color: '#3d5470', fontFamily: "'DM Sans', sans-serif" }}>
              {chip.label}
            </span>
            <span
              style={{
                fontSize: 12,
                color: chip.color,
                fontFamily: "'Roboto Mono', monospace",
                fontWeight: 600,
              }}
            >
              {chip.val}
            </span>
          </div>
        ))}
      </div>
      <div className="space-y-3 sm:hidden">
        {sortedTrades.map((trade, idx) => (
          <DayDetailTradeMobileBlock key={trade.id ?? `m-${idx}`} trade={trade} />
        ))}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e2d3d' }}>
              {['Time', 'Engine', 'Dir', 'Result', 'P&L R', 'P&L $', 'Close Reason', 'Bar1'].map(
                (heading) => (
                  <th
                    key={heading}
                    style={{
                      textAlign: 'left',
                      padding: '6px 10px',
                      color: '#3d5470',
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 500,
                      fontSize: 11,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {heading}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {sortedTrades.map((trade, idx) => (
              <DayDetailTradeRow key={trade.id ?? `trade-${idx}`} trade={trade} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
