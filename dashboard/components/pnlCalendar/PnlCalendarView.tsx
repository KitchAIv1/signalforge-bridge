'use client';

import { useMemo, useState } from 'react';
import { toDateKeyNow } from '@/lib/pnlCalendarFormat';
import { buildDaySummaries, buildEquityCurve } from '@/lib/pnlCalendarAggregates';
import { usePnlCalendarTrades } from '@/hooks/usePnlCalendarTrades';
import { usePnlCalendarDerivedStats } from '@/hooks/usePnlCalendarDerivedStats';
import { PnlCalendarSummaryStrip } from '@/components/pnlCalendar/PnlCalendarSummaryStrip';
import { PnlCalendarEquitySection } from '@/components/pnlCalendar/PnlCalendarEquitySection';
import { PnlCalendarGridSection } from '@/components/pnlCalendar/PnlCalendarGridSection';
import { PnlCalendarLegend } from '@/components/pnlCalendar/PnlCalendarLegend';
import { PnlCalendarEngineFilterBar } from '@/components/pnlCalendar/PnlCalendarEngineFilterBar';
import { DayDetailPanel } from '@/components/pnlCalendar/DayDetailPanel';
import {
  filterPnlCalendarTrades,
  PNL_CALENDAR_DEFAULT_FILTERS,
  toggleCalendarFilterKey,
  type PnlCalendarFilterKey,
} from '@/lib/pnlCalendarEngineFilter';

function initialViewMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function PnlCalendarView() {
  const { trades, loading, fetchError } = usePnlCalendarTrades();
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState<Date>(initialViewMonthUtc);
  const [engineFilters, setEngineFilters] = useState<PnlCalendarFilterKey[]>([
    ...PNL_CALENDAR_DEFAULT_FILTERS,
  ]);

  const filteredTrades = useMemo(
    () => filterPnlCalendarTrades(trades, engineFilters),
    [trades, engineFilters],
  );

  const todayKey = useMemo(() => toDateKeyNow(), []);
  const daySummaries = useMemo(
    () => buildDaySummaries(filteredTrades),
    [filteredTrades],
  );
  const equityCurve = useMemo(
    () => buildEquityCurve(filteredTrades),
    [filteredTrades],
  );
  const derived = usePnlCalendarDerivedStats(filteredTrades, daySummaries);

  const selectedDay = selectedDateKey ? daySummaries.get(selectedDateKey) : null;

  const toggleDay = (isoKey: string) => {
    setSelectedDateKey((prev) => (prev === isoKey ? null : isoKey));
  };

  const onToggleEngine = (key: PnlCalendarFilterKey) => {
    setEngineFilters((prev) => toggleCalendarFilterKey(prev, key));
    setSelectedDateKey(null);
  };

  return (
    <>
      <div
        className="min-h-screen px-4 py-6 sm:px-6 sm:py-7 lg:px-8"
        style={{
          background: '#070b0f',
          color: '#e0e8f0',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <CalendarHeader loading={loading} />

        {fetchError ? <FetchErrorBanner message={fetchError} /> : null}

        <PnlCalendarEngineFilterBar
          selectedKeys={engineFilters}
          onToggleKey={onToggleEngine}
        />

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

        {selectedDay ? (
          <DayDetailPanel day={selectedDay} onDismiss={() => setSelectedDateKey(null)} />
        ) : null}
      </div>
    </>
  );
}

function CalendarHeader({ loading }: { loading: boolean }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-5">
      <div className="min-w-0 flex-1">
        <h1
          className="text-[21px] font-bold leading-tight sm:text-[22px]"
          style={{ color: '#e0e8f0', margin: 0, letterSpacing: '-0.3px' }}
        >
          P&L Calendar
        </h1>
        <div style={{ fontSize: 12, color: '#3d5470', marginTop: 6 }}>
          Defaults: ALPHAOMEGA · AMD · AUD Fade · Apr 30, 2026 → present · 5 min refresh
        </div>
      </div>
      {loading ? (
        <div
          className="shrink-0"
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
      ) : null}
    </div>
  );
}

function FetchErrorBanner({ message }: { message: string }) {
  const isCap = message.includes('page cap');
  return (
    <div
      style={{
        background: isCap ? 'rgba(245,158,11,0.08)' : 'rgba(244,63,94,0.08)',
        border: isCap
          ? '1px solid rgba(245,158,11,0.25)'
          : '1px solid rgba(244,63,94,0.2)',
        borderRadius: 10,
        padding: '12px 16px',
        color: isCap ? '#f59e0b' : '#f43f5e',
        fontSize: 13,
        marginBottom: 20,
      }}
    >
      {message}
    </div>
  );
}
