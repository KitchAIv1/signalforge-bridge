'use client';

import { AsianSessionAmdMetricsCell } from '@/components/asianSession/AsianSessionAmdMetricsCell';
import { AsianSessionConfidencePill } from '@/components/asianSession/AsianSessionConfidencePill';
import { AsianSessionDirectionPill } from '@/components/asianSession/AsianSessionDirectionPill';
import type { AsianSessionAmdMetricsSlice } from '@/lib/asianSessionAmdMetricsTypes';
import {
  formatAsianNetPips,
  formatAsianSizeMultiplier,
  formatAsianTradeDate,
  summarizeNoFireDay,
} from '@/lib/asianSessionPageHelpers';
import type { AsianSessionDetection } from '@/lib/directionDecisionTypes';

type HistoryTableProps = {
  firedRows: AsianSessionDetection[];
  noFireDays: string[];
  rows: AsianSessionDetection[];
  amdMetricsByDate: ReadonlyMap<string, AsianSessionAmdMetricsSlice>;
};

function PriorBiasCell({ bias }: { bias: AsianSessionDetection['prior_direction_bias'] }) {
  if (bias === 'neutral') {
    return (
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
        NEUTRAL
      </span>
    );
  }
  return <AsianSessionDirectionPill direction={bias} />;
}

function formatSessionResultLabel(row: AsianSessionDetection): string {
  if (row.evaluated_net_pips == null || row.evaluated_direction == null) return '—';
  const pipsLabel = formatAsianNetPips(row.evaluated_net_pips);
  const directionLabel = row.evaluated_direction === 'long' ? 'UP' : 'DOWN';
  return `${pipsLabel} ${directionLabel}`;
}

function sessionResultTone(row: AsianSessionDetection): string {
  if (row.evaluated_net_pips == null || row.evaluated_direction == null) {
    return 'text-slate-400';
  }
  if (row.detection_direction == null) return 'text-slate-600 dark:text-slate-400';
  if (row.evaluated_direction === row.detection_direction) {
    return 'text-emerald-600 dark:text-emerald-400';
  }
  return 'text-red-600 dark:text-red-400';
}

type FiredHistoryRowProps = {
  row: AsianSessionDetection;
  amdMetricsByDate: ReadonlyMap<string, AsianSessionAmdMetricsSlice>;
};

function FiredHistoryRow({ row, amdMetricsByDate }: FiredHistoryRowProps) {
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
      <td className="px-3 py-2">
        <PriorBiasCell bias={row.prior_direction_bias} />
      </td>
      <td className={`px-3 py-2 text-xs ${sessionResultTone(row)}`}>
        {formatSessionResultLabel(row)}
      </td>
      <td className="px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        {row.failure_reason ?? ''}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {row.prior_amd_tag ?? '—'}
      </td>
      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
        {formatAsianSizeMultiplier(row.size_multiplier)}
      </td>
      <td className="min-w-[14rem] px-3 py-2 align-top">
        <AsianSessionAmdMetricsCell
          tradeDate={row.trade_date}
          metrics={amdMetricsByDate.get(row.trade_date)}
        />
      </td>
    </tr>
  );
}

function AmdSnapshotFootnote() {
  return (
    <p className="text-xs leading-relaxed text-slate-400 dark:text-slate-500">
      AMD snapshot (~10:31 UTC) describes the finished Asian session (00:00–08:00 UTC). It was not
      available at pattern check time. SHADOW fields are research-only and do not gate Asian fires.
    </p>
  );
}

export function AsianSessionHistoryTable({
  firedRows,
  noFireDays,
  rows,
  amdMetricsByDate,
}: HistoryTableProps) {
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
              <th className="px-3 py-2 text-left">Prior Bias</th>
              <th className="px-3 py-2 text-left">Session Result</th>
              <th className="px-3 py-2 text-left">Failure</th>
              <th className="px-3 py-2 text-left">Prior AMD</th>
              <th className="px-3 py-2 text-left">Size</th>
              <th className="px-3 py-2 text-left">AMD snapshot (10:31)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {firedRows.map((row) => (
              <FiredHistoryRow key={row.id} row={row} amdMetricsByDate={amdMetricsByDate} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Showing {firedRows.length} fired day{firedRows.length === 1 ? '' : 's'} · Session result from
        evaluated_net_pips / evaluated_direction
      </p>
      <AmdSnapshotFootnote />

      {noFireDays.length > 0 ? (
        <details className="rounded-lg border border-slate-200 dark:border-slate-700">
          <summary className="cursor-pointer px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
            Non-fire days ({noFireDays.length})
          </summary>
          <div className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            {noFireDays.map((tradeDate) => {
              const summary = summarizeNoFireDay(rows, tradeDate);
              return (
                <div key={tradeDate} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <span className="font-mono">{formatAsianTradeDate(tradeDate)}</span>
                    <span className="font-medium text-slate-600 dark:text-slate-300">
                      {summary.outcomeLabel}
                    </span>
                    <span>{summary.checkCount} checks</span>
                    <span>Prior: {summary.priorAmdTag ?? '—'}</span>
                    {summary.outcomeDetail ? (
                      <span className="text-xs text-slate-400">{summary.outcomeDetail}</span>
                    ) : null}
                  </div>
                  <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                    <AsianSessionAmdMetricsCell
                      tradeDate={tradeDate}
                      metrics={amdMetricsByDate.get(tradeDate)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}
