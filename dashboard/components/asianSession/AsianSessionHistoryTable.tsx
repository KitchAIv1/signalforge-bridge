'use client';

import { AsianSessionConfidencePill } from '@/components/asianSession/AsianSessionConfidencePill';
import { AsianSessionDirectionPill } from '@/components/asianSession/AsianSessionDirectionPill';
import {
  formatAsianNetPips,
  formatAsianSizeMultiplier,
  formatAsianTradeDate,
  formatPriorBiasLabel,
  summarizeNoFireDay,
} from '@/lib/asianSessionPageHelpers';
import type { AsianSessionDetection } from '@/lib/directionDecisionTypes';

type HistoryTableProps = {
  firedRows: AsianSessionDetection[];
  noFireDays: string[];
  rows: AsianSessionDetection[];
};

function FiredHistoryRow({ row }: { row: AsianSessionDetection }) {
  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">
        {formatAsianTradeDate(row.trade_date)}
      </td>
      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
        {row.condition_fired ?? '—'} @ {row.condition_check_time}
      </td>
      <td className="px-3 py-2">
        <AsianSessionDirectionPill direction={row.direction_set} />
      </td>
      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
        {formatAsianNetPips(row.detection_net_pips)}
      </td>
      <td className="px-3 py-2">
        <AsianSessionConfidencePill tier={row.confidence_tier} />
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {row.prior_amd_tag ?? '—'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {formatPriorBiasLabel(row.prior_direction_bias, row.prior_amd_tag)}
      </td>
      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
        {formatAsianSizeMultiplier(row.size_multiplier)}
      </td>
    </tr>
  );
}

export function AsianSessionHistoryTable({ firedRows, noFireDays, rows }: HistoryTableProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Condition</th>
              <th className="px-3 py-2 text-left">Direction</th>
              <th className="px-3 py-2 text-left">Net pips</th>
              <th className="px-3 py-2 text-left">Confidence</th>
              <th className="px-3 py-2 text-left">Prior AMD</th>
              <th className="px-3 py-2 text-left">Prior bias</th>
              <th className="px-3 py-2 text-left">Size</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {firedRows.map((row) => (
              <FiredHistoryRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Showing {firedRows.length} fired day{firedRows.length === 1 ? '' : 's'} · Correct column pending
        outcome tracking
      </p>

      {noFireDays.length > 0 ? (
        <details className="rounded-lg border border-slate-200 dark:border-slate-700">
          <summary className="cursor-pointer px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
            Non-fire days ({noFireDays.length})
          </summary>
          <div className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            {noFireDays.map((tradeDate) => {
              const summary = summarizeNoFireDay(rows, tradeDate);
              return (
                <div
                  key={tradeDate}
                  className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm text-slate-500 dark:text-slate-400"
                >
                  <span className="font-mono">{formatAsianTradeDate(tradeDate)}</span>
                  <span>No detection · {summary.checkCount} checks</span>
                  <span>Prior: {summary.priorAmdTag ?? '—'}</span>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}
