import * as fs from 'fs';
import * as path from 'path';
import type { AmdTag, TradeRowOut } from './amdBackfillTypes.ts';

export function csvEscape(
  field: string | number | boolean | null | undefined
): string {
  if (field === null || field === undefined) return '';
  const s = String(field);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function winPctFromPnl(pnlValues: number[]): number {
  if (pnlValues.length === 0) return 0;
  const wins = pnlValues.filter((p) => p > 0).length;
  return (100 * wins) / pnlValues.length;
}

export function writeTradeResultsCsv(
  tradeRows: TradeRowOut[],
  outDir: string
): string {
  const tradePath = path.join(outDir, 'amd_backfill_results.csv');
  const tradeHeader =
    'trade_id,created_at,direction,pnl_r,amd_tag,amd_trade_phase,' +
    'asian_range_pips,judas_direction,judas_pips,reversal_confirmed,' +
    'session_direction_alignment';
  const tradeLines = [tradeHeader];
  for (const row of tradeRows) {
    tradeLines.push(
      [
        csvEscape(row.trade_id),
        csvEscape(row.created_at),
        csvEscape(row.direction),
        csvEscape(row.pnl_r),
        csvEscape(row.amd_tag),
        csvEscape(row.amd_trade_phase),
        csvEscape(row.asian_range_pips),
        csvEscape(row.judas_direction),
        csvEscape(row.judas_pips),
        csvEscape(row.reversal_confirmed),
        csvEscape(row.session_direction_alignment),
      ].join(',')
    );
  }
  fs.writeFileSync(tradePath, tradeLines.join('\n'), 'utf8');
  return tradePath;
}

export function writeSummaryByTagCsv(
  tradeRows: TradeRowOut[],
  outDir: string
): string {
  const tagGroups = new Map<AmdTag, TradeRowOut[]>();
  for (const row of tradeRows) {
    const bucket = tagGroups.get(row.amd_tag) ?? [];
    bucket.push(row);
    tagGroups.set(row.amd_tag, bucket);
  }

  const summaryPath = path.join(outDir, 'amd_summary_by_tag.csv');
  const summaryHeader =
    'amd_tag,n_trades,avg_pnl_r,win_pct,' +
    'avg_pnl_r_distribution_phase_only,avg_pnl_r_aligned_only';
  const summaryLines = [summaryHeader];

  const tagOrder = [...tagGroups.keys()].sort();
  for (const tag of tagOrder) {
    const group = tagGroups.get(tag) ?? [];
    const pnls = group.map((row) => row.pnl_r);
    const distOnly = group.filter(
      (row) => row.amd_trade_phase === 'DISTRIBUTION'
    );
    const alignedOnly = group.filter(
      (row) => row.session_direction_alignment === 'ALIGNED'
    );
    summaryLines.push(
      [
        csvEscape(tag),
        csvEscape(group.length),
        csvEscape(average(pnls)),
        csvEscape(winPctFromPnl(pnls)),
        csvEscape(average(distOnly.map((r) => r.pnl_r))),
        csvEscape(average(alignedOnly.map((r) => r.pnl_r))),
      ].join(',')
    );
  }
  fs.writeFileSync(summaryPath, summaryLines.join('\n'), 'utf8');
  return summaryPath;
}
