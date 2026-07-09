/**
 * CSV export for ALPHAOMEGA Lane B trade rows.
 */

import type { BridgeTradeLogRow } from '@/lib/types';
import { formatAlphaOmegaBlockReason, parseAlphaOmegaFoundingMeta } from '@/lib/alphaOmegaAdvisoryParse';
import { formatCloseReason } from '@/lib/formatCloseReason';
import { resolvePhase2AdvisoryDisplay } from '@/lib/phase2LaneAdvisoryFormat';

const CSV_HEADERS = [
  'created_at',
  'direction',
  'decision',
  'signal_kind',
  'founding_length',
  'founding_speed_min',
  'block_or_close',
  'status',
  'result',
  'pnl_pips',
  'pnl_dollars',
  'duration_minutes',
  'session',
  'lane_advisory',
  'signal_id',
] as const;

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function cell(value: string | number | null | undefined): string {
  if (value == null) return '';
  return csvEscape(String(value));
}

function blockOrClose(row: BridgeTradeLogRow): string {
  if (row.decision === 'BLOCKED') return formatAlphaOmegaBlockReason(row.block_reason);
  return formatCloseReason(row.close_reason);
}

function rowToCsvLine(row: BridgeTradeLogRow): string {
  const display = resolvePhase2AdvisoryDisplay(
    row.lane_advisory,
    row.decision,
    row.block_reason,
  );
  const founding = parseAlphaOmegaFoundingMeta(row.lane_advisory);
  return [
    cell(row.created_at),
    cell(row.direction),
    cell(row.decision),
    cell(display.label),
    cell(founding.foundingLength),
    cell(founding.foundingSpeedMin),
    cell(blockOrClose(row)),
    cell(row.status),
    cell(row.result),
    cell(row.pnl_pips),
    cell(row.pnl_dollars),
    cell(row.duration_minutes),
    cell(row.signal_session),
    cell(row.lane_advisory),
    cell(row.signal_id),
  ].join(',');
}

export function buildAlphaOmegaTradeCsv(tradeRows: BridgeTradeLogRow[]): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of tradeRows) {
    lines.push(rowToCsvLine(row));
  }
  return lines.join('\n');
}

export function downloadAlphaOmegaTradeCsv(tradeRows: BridgeTradeLogRow[]): void {
  const csv = buildAlphaOmegaTradeCsv(tradeRows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `alphaomega-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
