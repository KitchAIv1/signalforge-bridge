'use client';

import { useMemo, useState } from 'react';
import { ENGINE_COLORS } from '@/lib/pnlCalendarConstants';
import { toDateKeyNow } from '@/lib/pnlCalendarFormat';
import { buildDaySummaries, buildEquityCurve } from '@/lib/pnlCalendarAggregates';
import { usePnlCalendarTrades } from '@/hooks/usePnlCalendarTrades';
import { usePnlCalendarDerivedStats } from '@/hooks/usePnlCalendarDerivedStats';
import { PnlCalendarSummaryStrip } from '@/components/pnlCalendar/PnlCalendarSummaryStrip';
import { PnlCalendarEquitySection } from '@/components/pnlCalendar/PnlCalendarEquitySection';
import { PnlCalendarGridSection } from '@/components/pnlCalendar/PnlCalendarGridSection';
import { PnlCalendarLegend } from '@/components/pnlCalendar/PnlCalendarLegend';
import { DayDetailPanel } from '@/components/pnlCalendar/DayDetailPanel';

function initialViewMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function PnlCalendarView() {
  const { trades, loading, fetchError } = usePnlCalendarTrades();
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState<Date>(initialViewMonthUtc);

  const todayKey = useMemo(() => toDateKeyNow(), []);
  const daySummaries = useMemo(() => buildDaySummaries(trades), [trades]);
  const equityCurve = useMemo(() => buildEquityCurve(trades), [trades]);
  const derived = usePnlCalendarDerivedStats(trades, daySummaries);

  const selectedDay = selectedDateKey ? daySummaries.get(selectedDateKey) : null;

  const toggleDay = (isoKey: string) => {
    setSelectedDateKey((prev) => (prev === isoKey ? null : isoKey));
  };

  return (
    <>
      <div
        style={{
          minHeight: '100vh',
          background: '#070b0f',
          color: '#e0e8f0',
          fontFamily: "'DM Sans', sans-serif",
          padding: '28px 32px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 28,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: '#e0e8f0',
                  margin: 0,
                  letterSpacing: '-0.3px',
                }}
              >
                P&L Calendar
              </h1>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['omega', 'engine_rebuild'] as const).map((engineKey) => (
                  <span
                    key={engineKey}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: ENGINE_COLORS[engineKey],
                      background: `${ENGINE_COLORS[engineKey]}18`,
                      border: `1px solid ${ENGINE_COLORS[engineKey]}33`,
                      borderRadius: 5,
                      padding: '2px 8px',
                    }}
                  >
                    {engineKey === 'omega' ? 'Omega' : 'Rebuild'}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#3d5470' }}>
              Live bridge trades · Apr 30, 2026 → present · Auto-refreshes every 5 min
            </div>
          </div>
          {loading && (
            <div
              style={{
                fontSize: 12,
                color: '#3d5470',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <div
                className="pnl-cal-pulse-dot"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#3b82f6',
                }}
              />
              Loading…
            </div>
          )}
        </div>

        {fetchError && (
          <div
            style={{
              background: 'rgba(244,63,94,0.08)',
              border: '1px solid rgba(244,63,94,0.2)',
              borderRadius: 10,
              padding: '12px 16px',
              color: '#f43f5e',
              fontSize: 13,
              marginBottom: 20,
            }}
          >
            ⚠ Query error: {fetchError}
          </div>
        )}

        <PnlCalendarSummaryStrip
          totalR={derived.totalR}
          totalDollars={derived.totalDollars}
          hasNullDollarsGlobal={derived.hasNullDollarsGlobal}
          totalTrades={derived.totalTrades}
          globalWinRate={derived.globalWinRate}
          bestDay={derived.bestDay}
          worstDay={derived.worstDay}
        />

        <PnlCalendarEquitySection equityCurve={equityCurve} />

        <PnlCalendarGridSection
          viewDate={viewDate}
          onViewDateChange={setViewDate}
          daySummaries={daySummaries}
          selectedDateKey={selectedDateKey}
          onToggleSelect={toggleDay}
          todayKey={todayKey}
        />

        <PnlCalendarLegend
          hasNullDollarsGlobal={derived.hasNullDollarsGlobal}
          nullDollarTradeCount={derived.nullDollarTradeCount}
          detailOpen={Boolean(selectedDay)}
        />

        {selectedDay && (
          <DayDetailPanel day={selectedDay} onDismiss={() => setSelectedDateKey(null)} />
        )}
      </div>
    </>
  );
}
