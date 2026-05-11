'use client';

interface PnlCalendarLegendProps {
  hasNullDollarsGlobal: boolean;
  nullDollarTradeCount: number;
  detailOpen: boolean;
}

export function PnlCalendarLegend({
  hasNullDollarsGlobal,
  nullDollarTradeCount,
  detailOpen,
}: PnlCalendarLegendProps) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] leading-snug" style={{ marginBottom: detailOpen ? 16 : 0, color: '#3d5470' }}>
      <span>Click any trade day to expand detail</span>
      <span style={{ color: '#d97706' }}>● = partial $ data (null P&L on some trades)</span>
      <span>Numbers in UTC</span>
      {hasNullDollarsGlobal && (
        <span style={{ color: '#d97706' }}>
          * Total $ sum ignores {nullDollarTradeCount} null-dollar trade
          {nullDollarTradeCount === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
}
