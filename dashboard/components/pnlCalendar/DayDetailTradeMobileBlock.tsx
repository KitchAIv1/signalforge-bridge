'use client';

import { ENGINE_COLORS } from '@/lib/pnlCalendarConstants';
import type { PnlTradeRow } from '@/lib/pnlCalendarTypes';
import { getRColor, getRValue } from '@/lib/pnlCalendarFormat';
import { formatCloseReason } from '@/lib/formatCloseReason';

interface DayDetailTradeMobileBlockProps {
  trade: PnlTradeRow;
}

function engineLabelFor(trade: PnlTradeRow): string {
  if (trade.engine_id === 'omega') return 'Omega';
  if (trade.engine_id === 'engine_rebuild') return 'Rebuild';
  return trade.engine_id;
}

export function DayDetailTradeMobileBlock({ trade }: DayDetailTradeMobileBlockProps) {
  const clockLabel = new Date(trade.created_at).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
  const rComponent = trade.pnl_r ?? 0;
  const engColor = ENGINE_COLORS[trade.engine_id] ?? '#64748b';
  const verdictWin = trade.result?.toLowerCase() === 'win';
  const verdictLoss = trade.result?.toLowerCase() === 'loss';

  return (
    <div
      className="rounded-lg border border-[#1e2d3d] bg-[#111827] p-3"
      style={{ fontSize: 12 }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-[#4a6080]">{clockLabel}</span>
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
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
        <span
          style={{
            color: trade.direction?.toLowerCase() === 'long' ? '#0ea5e9' : '#e879f9',
            fontFamily: "'Roboto Mono', monospace",
            textTransform: 'uppercase',
          }}
        >
          {trade.direction?.toUpperCase() ?? '—'}
        </span>
        <span style={{ color: verdictWin ? '#10b981' : verdictLoss ? '#f43f5e' : '#64748b' }}>
          {(trade.result ?? '—').toUpperCase()}
        </span>
        <span style={{ color: getRColor(rComponent), fontFamily: "'Roboto Mono', monospace" }}>
          {trade.pnl_r !== null ? getRValue(rComponent) : '—'}
        </span>
        <span style={{ color: getRColor(trade.pnl_dollars ?? 0), fontFamily: "'Roboto Mono', monospace" }}>
          {trade.pnl_dollars !== null
            ? `${trade.pnl_dollars >= 0 ? '+' : ''}$${trade.pnl_dollars.toFixed(2)}`
            : 'null'}
        </span>
      </div>
      <div className="mt-2 break-words text-[11px] text-[#3d5470]">
        <span className="font-medium text-[#64748b]">Close: </span>
        {formatCloseReason(trade.close_reason)}
      </div>
      <div className="mt-2">
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
            Bar1: {trade.bar1_strength}
          </span>
        ) : (
          <span className="text-[#1e2d3d]">Bar1 —</span>
        )}
      </div>
    </div>
  );
}
