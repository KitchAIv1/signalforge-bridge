'use client';

import { useMemo } from 'react';
import { CALENDAR_START, PNL_CALENDAR_EARLIEST_UTC_MS } from '@/lib/pnlCalendarConstants';
import type { DaySummary } from '@/lib/pnlCalendarTypes';
import { getDaysInMonthUtc, shiftMonthStartUtc, toDateKeyFromInput } from '@/lib/pnlCalendarFormat';
import { DayCell } from '@/components/pnlCalendar/DayCell';

interface PnlCalendarGridSectionProps {
  viewDate: Date;
  onViewDateChange: (next: Date) => void;
  daySummaries: Map<string, DaySummary>;
  selectedDateKey: string | null;
  onToggleSelect: (isoKey: string) => void;
  todayKey: string;
}

export function PnlCalendarGridSection({
  viewDate,
  onViewDateChange,
  daySummaries,
  selectedDateKey,
  onToggleSelect,
  todayKey,
}: PnlCalendarGridSectionProps) {
  const calendarCells = useMemo(() => {
    const year = viewDate.getUTCFullYear();
    const month = viewDate.getUTCMonth();
    const monthDays = getDaysInMonthUtc(year, month);
    const firstDow = monthDays[0].getUTCDay();
    const cells: Array<Date | null> = [];
    for (let pad = 0; pad < firstDow; pad += 1) cells.push(null);
    for (const d of monthDays) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewDate]);

  const monthLabel = viewDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const goPriorMonth = () => {
    const prior = shiftMonthStartUtc(viewDate, -1);
    if (prior.getTime() < PNL_CALENDAR_EARLIEST_UTC_MS) return;
    onViewDateChange(prior);
  };

  const goNextMonth = () => {
    onViewDateChange(shiftMonthStartUtc(viewDate, 1));
  };

  return (
    <div
      style={{
        background: '#0e1420',
        border: '1px solid #1e2d3d',
        borderRadius: 14,
        padding: '20px 22px',
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 18,
        }}
      >
        <button
          type="button"
          onClick={goPriorMonth}
          style={{
            background: '#111827',
            border: '1px solid #1e2d3d',
            borderRadius: 7,
            color: '#64748b',
            cursor: 'pointer',
            padding: '6px 14px',
            fontSize: 14,
          }}
        >
          ←
        </button>
        <span
          style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.5px' }}
        >
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={goNextMonth}
          style={{
            background: '#111827',
            border: '1px solid #1e2d3d',
            borderRadius: 7,
            color: '#64748b',
            cursor: 'pointer',
            padding: '6px 14px',
            fontSize: 14,
          }}
        >
          →
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 4,
          marginBottom: 4,
        }}
      >
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
          <div
            key={label}
            style={{
              textAlign: 'center',
              fontSize: 11,
              color: '#3d5470',
              fontWeight: 600,
              padding: '4px 0 8px',
              letterSpacing: '0.5px',
            }}
          >
            {label}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {calendarCells.map((cellDate, idx) => {
          if (!cellDate) {
            return <div key={`pad-${idx}`} style={{ minHeight: 110 }} />;
          }
          const isoKey = toDateKeyFromInput(cellDate);
          const day = daySummaries.get(isoKey);
          const beforeStart = cellDate < CALENDAR_START;
          const inMonth =
            cellDate.getUTCMonth() === viewDate.getUTCMonth() &&
            cellDate.getUTCFullYear() === viewDate.getUTCFullYear();
          return (
            <DayCell
              key={isoKey}
              date={cellDate}
              day={day}
              isCurrentMonth={inMonth}
              isToday={isoKey === todayKey}
              isSelected={selectedDateKey === isoKey}
              isBeforeStart={beforeStart}
              onActivate={() => onToggleSelect(isoKey)}
            />
          );
        })}
      </div>
    </div>
  );
}
