'use client';

import { ENGINE_COLORS } from '@/lib/pnlCalendarConstants';
import { calendarTradeEngineLabel } from '@/lib/pnlCalendarEngineFilter';
import type { PnlTradeRow } from '@/lib/pnlCalendarTypes';
import { getRColor, getRValue } from '@/lib/pnlCalendarFormat';
import { formatCloseReason } from '@/lib/formatCloseReason';
import { hasPnlCalendarTradeR, resolvePnlCalendarTradeR } from '@/lib/resolvePnlCalendarTradeR';

interface DayDetailTradeRowProps {
  trade: PnlTradeRow;
}

function engineLabelFor(trade: PnlTradeRow): string {
  return calendarTradeEngineLabel(trade);
}

export function DayDetailTradeRow({ trade }: DayDetailTradeRowProps) {
  const clockLabel = new Date(trade.created_at).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
  const rComponent = resolvePnlCalendarTradeR(trade);
  const engColor = ENGINE_COLORS[trade.engine_id] ?? '#64748b';
  const verdictWin = trade.result?.toLowerCase() === 'win';
  const verdictLoss = trade.result?.toLowerCase() === 'loss';

  return (
    <tr
      style={{
        borderBottom: '1px solid #111827',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#0f1925';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <td style={{ padding: '7px 10px', color: '#4a6080', fontFamily: "'Roboto Mono', monospace" }}>
        {clockLabel}
      </td>
      <td style={{ padding: '7px 10px' }}>
        <span
          style={{
            background: `${engColor}22`,
            color: engColor,
            borderRadius: 4,
            padding: '2px 7px',
            fontSize: 11,
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600,
          }}
        >
          {engineLabelFor(trade)}
        </span>
      </td>
      <td
        style={{
          padding: '7px 10px',
          color: trade.direction?.toLowerCase() === 'long' ? '#0ea5e9' : '#e879f9',
          fontFamily: "'Roboto Mono', monospace",
          textTransform: 'uppercase',
          fontSize: 11,
        }}
      >
        {trade.direction?.toUpperCase() ?? '—'}
      </td>
      <td style={{ padding: '7px 10px' }}>
        <span
          style={{
            color: verdictWin ? '#10b981' : verdictLoss ? '#f43f5e' : '#64748b',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {(trade.result ?? '—').toUpperCase()}
        </span>
      </td>
      <td
        style={{
          padding: '7px 10px',
          color: getRColor(rComponent),
          fontFamily: "'Roboto Mono', monospace",
          fontWeight: 600,
        }}
      >
        {hasPnlCalendarTradeR(trade) ? getRValue(rComponent) : '—'}
      </td>
      <td
        style={{
          padding: '7px 10px',
          color: getRColor(trade.pnl_dollars ?? 0),
          fontFamily: "'Roboto Mono', monospace",
        }}
      >
        {trade.pnl_dollars !== null ? (
          `${trade.pnl_dollars >= 0 ? '+' : ''}$${trade.pnl_dollars.toFixed(2)}`
        ) : (
          <span style={{ color: '#d97706' }}>null ⚠</span>
        )}
      </td>
      <td
        style={{
          padding: '7px 10px',
          color: '#3d5470',
          fontFamily: "'DM Sans', sans-serif",
          maxWidth: 180,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {formatCloseReason(trade.close_reason)}
      </td>
      <td style={{ padding: '7px 10px' }}>
        {trade.bar1_strength ? (
          <span
            style={{
              fontSize: 10,
              fontFamily: "'DM Sans', sans-serif",
              color:
                trade.bar1_strength === 'strong'
                  ? '#10b981'
                  : trade.bar1_strength === 'against'
                    ? '#f43f5e'
                    : '#94a3b8',
              background:
                trade.bar1_strength === 'strong'
                  ? 'rgba(16,185,129,0.1)'
                  : trade.bar1_strength === 'against'
                    ? 'rgba(244,63,94,0.1)'
                    : '#1a2535',
              borderRadius: 4,
              padding: '2px 6px',
            }}
          >
            {trade.bar1_strength}
          </span>
        ) : (
          <span style={{ color: '#1e2d3d' }}>—</span>
        )}
      </td>
    </tr>
  );
}
