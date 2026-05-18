'use client';

import type { BridgeTradeLogRow } from '@/lib/types';
import { amdTagLabel, amdTagColor } from '@/lib/amdPanelFormatters';
import { formatActivityIsoTimestamp } from '@/components/activity/activityFormat';
import { RegimeConfidenceBadge } from '@/components/RegimeConfidenceBadge';

interface ActivityTradeMobileCardProps {
  row: BridgeTradeLogRow;
}

function badgeForDecision(decision: string): string {
  if (decision === 'EXECUTED') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';
  }
  if (decision === 'BLOCKED') {
    return 'bg-red-100 text-red-700 dark:bg-red-950/45 dark:text-red-300';
  }
  return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
}

function badgeForResult(resultLabel: string): string {
  const lower = resultLabel.toLowerCase();
  if (lower === 'win') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';
  if (lower === 'loss') return 'bg-red-100 text-red-700 dark:bg-red-950/45 dark:text-red-300';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-700/70 dark:text-slate-200';
}

function pnlAccentClass(row: BridgeTradeLogRow): string {
  if (row.result === 'win') return 'text-emerald-600 dark:text-emerald-400';
  if (row.result === 'loss') return 'text-red-600 dark:text-red-400';
  return 'text-slate-700 dark:text-slate-400';
}

export function ActivityTradeMobileCard({ row }: ActivityTradeMobileCardProps) {
  const isExecuted = row.decision === 'EXECUTED';
  const badgeDecision = badgeForDecision(row.decision);
  const pnlAccent = pnlAccentClass(row);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400">{formatActivityIsoTimestamp(row.created_at)}</div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-900 dark:text-slate-100">
            <span className="font-semibold">{row.engine_id}</span>
            <span className="text-slate-700 dark:text-slate-400">{row.pair}</span>
          </div>
        </div>
        <span className={`shrink-0 rounded px-2 py-1 text-[11px] font-semibold ${badgeDecision}`}>
          {row.decision}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px] sm:grid-cols-4">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-600 dark:text-slate-400">Direction</dt>
          <dd className="font-medium text-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-1">
              {row.direction === 'long' || row.direction === 'LONG' ? (
                <span className="text-emerald-600 dark:text-emerald-400">LONG</span>
              ) : (
                <span className="text-red-600 dark:text-red-400">SHORT</span>
              )}
              {row.direction_source === 'auto' && (
                <span className="rounded bg-blue-100 px-1 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  AUTO
                </span>
              )}
            </div>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-600 dark:text-slate-400">Score</dt>
          <dd className="font-mono text-slate-900 dark:text-slate-300">{row.confluence_score ?? '—'}</dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-[11px] uppercase tracking-wide text-slate-600 dark:text-slate-400">P&amp;L (R)</dt>
          <dd className={`font-mono font-semibold ${pnlAccent}`}>
            {row.pnl_r != null ? (row.pnl_r >= 0 ? '+' : '') + Number(row.pnl_r).toFixed(2) + 'R' : '—'}
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-[11px] uppercase tracking-wide text-slate-600 dark:text-slate-400">Result</dt>
          <dd className="mt-0.5">
            {row.result ? (
              <span
                className={`inline-block rounded px-2 py-1 text-[11px] font-semibold ${badgeForResult(
                  row.result
                )}`}
              >
                {row.result}
              </span>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">—</span>
            )}
          </dd>
        </div>
      </dl>

      <details className="group mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-800 dark:bg-slate-950/55 dark:text-slate-100">
        <summary className="cursor-pointer select-none font-medium text-slate-900 underline-offset-2 group-open:no-underline dark:text-slate-100">
          Details &amp; executions
        </summary>
        <div className="mt-3 space-y-3 text-[13px]">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-600 dark:text-slate-400">Reason</div>
            <div className="break-words text-slate-800 dark:text-slate-200">{row.block_reason ?? '—'}</div>
          </div>
          <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-600 dark:text-slate-400">Regime dir</div>
              <div className="break-words text-slate-900 dark:text-slate-100">{row.regime_direction ?? '—'}</div>
            </div>
            <RegimeConfidenceBadge
              confidence={row.regime_confidence ?? null}
              direction={row.regime_direction ?? null}
              evaluatedAt={row.regime_evaluated_at ?? null}
            />
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-600 dark:text-slate-400">AMD tag</div>
              <div className={`text-sm font-semibold ${amdTagColor(row.amd_tag ?? null)}`}>
                {row.amd_tag != null && row.amd_tag !== '' ? amdTagLabel(row.amd_tag) : '—'}
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-[11px] text-slate-600 dark:text-slate-400">Fill</dt>
              <dd className="font-mono text-xs text-slate-800 dark:text-slate-300">
                {isExecuted && row.fill_price != null ? Number(row.fill_price).toFixed(5) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-600 dark:text-slate-400">SL</dt>
              <dd className="font-mono text-xs text-slate-800 dark:text-slate-300">
                {isExecuted && row.stop_loss != null ? Number(row.stop_loss).toFixed(5) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-600 dark:text-slate-400">TP</dt>
              <dd className="font-mono text-xs text-slate-800 dark:text-slate-300">
                {isExecuted && row.take_profit != null ? Number(row.take_profit).toFixed(5) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-600 dark:text-slate-400">Exit</dt>
              <dd className="font-mono text-xs text-slate-800 dark:text-slate-300">
                {isExecuted && row.exit_price != null ? Number(row.exit_price).toFixed(5) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-600 dark:text-slate-400">Lots</dt>
              <dd className="font-mono text-xs text-slate-800 dark:text-slate-300">
                {isExecuted && row.lot_size != null ? Number(row.lot_size).toFixed(2) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-600 dark:text-slate-400">P&amp;L $</dt>
              <dd className={`font-mono text-xs font-semibold ${pnlAccent}`}>
                {row.pnl_dollars != null
                  ? (row.pnl_dollars >= 0 ? '+' : '') + Number(row.pnl_dollars).toFixed(2)
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-600 dark:text-slate-400">Pips</dt>
              <dd className={`font-mono text-xs ${pnlAccent}`}>
                {row.pnl_pips != null ? (row.pnl_pips >= 0 ? '+' : '') + Number(row.pnl_pips).toFixed(1) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-600 dark:text-slate-400">Dur</dt>
              <dd className="font-mono text-xs text-slate-700 dark:text-slate-400">
                {row.duration_minutes != null ? Math.round(Number(row.duration_minutes)) + 'm' : '—'}
              </dd>
            </div>
          </dl>
        </div>
      </details>
    </article>
  );
}
