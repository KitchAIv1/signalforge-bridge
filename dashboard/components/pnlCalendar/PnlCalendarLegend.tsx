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
    <div
      style={{
        display: 'flex',
        gap: 20,
        fontSize: 11,
        color: '#3d5470',
        marginBottom: detailOpen ? 16 : 0,
      }}
    >
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
