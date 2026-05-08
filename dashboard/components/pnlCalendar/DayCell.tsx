'use client';

import { useState } from 'react';
import type { DaySummary } from '@/lib/pnlCalendarTypes';
import {
  getCellBg,
  getCellBorder,
  getDollarValue,
  getRColor,
  getRValue,
} from '@/lib/pnlCalendarFormat';

interface DayCellProps {
  date: Date | null;
  day?: DaySummary;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isBeforeStart: boolean;
  onActivate: () => void;
}

export function DayCell({
  date,
  day,
  isCurrentMonth,
  isToday,
  isSelected,
  isBeforeStart,
  onActivate,
}: DayCellProps) {
  const [hovered, setHovered] = useState(false);

  if (!date) {
    return <div style={{ minHeight: 110, background: 'transparent' }} />;
  }

  const tradeCount = day?.tradeCount ?? 0;
  const hasTrades = tradeCount > 0;
  const netR = day?.netR ?? 0;
  const bg = getCellBg(netR, tradeCount);
  const border = getCellBorder(netR, tradeCount, isSelected);
  const dim = isBeforeStart || !isCurrentMonth;

  return (
    <div
      role={hasTrades ? 'button' : undefined}
      tabIndex={hasTrades ? 0 : undefined}
      onClick={hasTrades ? onActivate : undefined}
      onKeyDown={
        hasTrades
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onActivate();
              }
            }
          : undefined
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        minHeight: 110,
        background: isSelected
          ? 'rgba(59,130,246,0.07)'
          : hovered && hasTrades
            ? 'rgba(255,255,255,0.02)'
            : bg,
        border,
        borderRadius: 10,
        padding: '10px 11px 8px',
        cursor: hasTrades ? 'pointer' : 'default',
        opacity: dim ? 0.25 : 1,
        transition: 'all 0.15s ease',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: isToday ? 700 : 400,
            color: isToday ? '#3b82f6' : '#4a6080',
            background: isToday ? 'rgba(59,130,246,0.12)' : 'transparent',
            borderRadius: 4,
            padding: isToday ? '1px 5px' : 0,
          }}
        >
          {date.getUTCDate()}
        </span>
        {hasTrades && (
          <span
            style={{
              fontSize: 10,
              fontFamily: "'Roboto Mono', monospace",
              color: '#4a6080',
              background: '#1a2535',
              borderRadius: 4,
              padding: '1px 5px',
            }}
          >
            {tradeCount}
          </span>
        )}
      </div>
      {hasTrades && day != null && (
        <>
          <div
            style={{
              fontSize: 18,
              fontFamily: "'Roboto Mono', monospace",
              fontWeight: 600,
              color: getRColor(day.netR),
              letterSpacing: '-0.5px',
              lineHeight: 1,
              marginTop: 4,
            }}
          >
            {getRValue(day.netR)}
          </div>
          <div
            style={{
              fontSize: 11,
              fontFamily: "'Roboto Mono', monospace",
              color: getRColor(day.netDollars),
              opacity: 0.75,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            {getDollarValue(day.netDollars, day.hasNullDollars)}
            {day.hasNullDollars && (
              <span title="Some trades missing P&L data" style={{ color: '#d97706', fontSize: 9 }}>
                ●
              </span>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 'auto',
              paddingTop: 6,
            }}
          >
            <span style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", color: '#3d5470' }}>
              {day.winRate}% WR
            </span>
            <div style={{ display: 'flex', gap: 3 }}>
              {day.omegaNetR !== 0 && (
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 700,
                    color: '#7c3aed',
                    background: 'rgba(124,58,237,0.15)',
                    borderRadius: 3,
                    padding: '1px 4px',
                  }}
                >
                  Ω
                </span>
              )}
              {day.rebuildNetR !== 0 && (
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 700,
                    color: '#d97706',
                    background: 'rgba(217,119,6,0.15)',
                    borderRadius: 3,
                    padding: '1px 4px',
                  }}
                >
                  R
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
