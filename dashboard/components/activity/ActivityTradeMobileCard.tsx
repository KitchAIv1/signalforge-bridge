'use client';

import type { BridgeTradeLogRow } from '@/lib/types';
import { amdTagLabel, amdTagColor } from '@/lib/amdPanelFormatters';
import { formatActivityIsoTimestamp } from '@/components/activity/activityFormat';
import { RegimeConfidenceBadge } from '@/components/RegimeConfidenceBadge';

interface ActivityTradeMobileCardProps {
  row: BridgeTradeLogRow;
}

function badgeForDecision(decision: string): string {
  if (decision === 'EXECUTED') return 'bg-emerald-100 text-emerald-700';
  if (decision === 'BLOCKED') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
}

function badgeForResult(resultLabel: string): string {
  const lower = resultLabel.toLowerCase();
  if (lower === 'win') return 'bg-emerald-100 text-emerald-700';
  if (lower === 'loss') return 'bg-red-100 text-red-700';
  return 'bg-slate-100 text-slate-600';
}

function pnlAccentClass(row: BridgeTradeLogRow): string {
  if (row.result === 'win') return 'text-emerald-600';
  if (row.result === 'loss') return 'text-red-500';
  return 'text-slate-600';
}

export function ActivityTradeMobileCard({ row }: ActivityTradeMobileCardProps) {
  const isExecuted = row.decision === 'EXECUTED';
  const badgeDecision = badgeForDecision(row.decision);
  const pnlAccent = pnlAccentClass(row);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="text-xs font-medium text-slate-500">{formatActivityIsoTimestamp(row.created_at)}</div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-900">
            <span className="font-semibold">{row.engine_id}</span>
            <span className="text-slate-600">{row.pair}</span>
          </div>
        </div>
        <span className={`shrink-0 rounded px-2 py-1 text-[11px] font-semibold ${badgeDecision}`}>
          {row.decision}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px] sm:grid-cols-4">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">Direction</dt>
          <dd className="font-medium">
            {row.direction === 'long' || row.direction === 'LONG' ? (
              <span className="text-emerald-600">LONG</span>
            ) : (
              <span className="text-red-500">SHORT</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">Score</dt>
          <dd className="font-mono">{row.confluence_score ?? '—'}</dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">P&amp;L (R)</dt>
          <dd className={`font-mono font-semibold ${pnlAccent}`}>
            {row.pnl_r != null ? (row.pnl_r >= 0 ? '+' : '') + Number(row.pnl_r).toFixed(2) + 'R' : '—'}
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">Result</dt>
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
              <span className="text-slate-600">—</span>
            )}
          </dd>
        </div>
      </dl>

      <details className="group mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
        <summary className="cursor-pointer select-none font-medium text-slate-800 underline-offset-2 group-open:no-underline">
          Details &amp; executions
        </summary>
        <div className="mt-3 space-y-3 text-[13px]">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Reason</div>
            <div className="break-words text-slate-700">{row.block_reason ?? '—'}</div>
          </div>
          <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Regime dir</div>
              <div className="break-words text-slate-800">{row.regime_direction ?? '—'}</div>
            </div>
            <RegimeConfidenceBadge
              confidence={row.regime_confidence ?? null}
              direction={row.regime_direction ?? null}
              evaluatedAt={row.regime_evaluated_at ?? null}
            />
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">AMD tag</div>
              <div className={`text-sm font-semibold ${amdTagColor(row.amd_tag ?? null)}`}>
                {row.amd_tag != null && row.amd_tag !== '' ? amdTagLabel(row.amd_tag) : '—'}
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-[11px] text-slate-500">Fill</dt>
              <dd className="font-mono text-xs">
                {isExecuted && row.fill_price != null ? Number(row.fill_price).toFixed(5) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">SL</dt>
              <dd className="font-mono text-xs">
                {isExecuted && row.stop_loss != null ? Number(row.stop_loss).toFixed(5) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">TP</dt>
              <dd className="font-mono text-xs">
                {isExecuted && row.take_profit != null ? Number(row.take_profit).toFixed(5) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">Exit</dt>
              <dd className="font-mono text-xs">
                {isExecuted && row.exit_price != null ? Number(row.exit_price).toFixed(5) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">Lots</dt>
              <dd className="font-mono text-xs">
                {isExecuted && row.lot_size != null ? Number(row.lot_size).toFixed(2) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">P&amp;L $</dt>
              <dd className={`font-mono text-xs font-semibold ${pnlAccent}`}>
                {row.pnl_dollars != null
                  ? (row.pnl_dollars >= 0 ? '+' : '') + Number(row.pnl_dollars).toFixed(2)
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">Pips</dt>
              <dd className={`font-mono text-xs ${pnlAccent}`}>
                {row.pnl_pips != null ? (row.pnl_pips >= 0 ? '+' : '') + Number(row.pnl_pips).toFixed(1) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">Dur</dt>
              <dd className="font-mono text-xs text-slate-600">
                {row.duration_minutes != null ? Math.round(Number(row.duration_minutes)) + 'm' : '—'}
              </dd>
            </div>
          </dl>
        </div>
      </details>
    </article>
  );
}
