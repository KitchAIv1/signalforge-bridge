'use client';

import type { BridgeTradeLogRow } from '@/lib/types';
import { amdTagColor, amdTagLabel } from '@/lib/amdPanelFormatters';
import { formatActivityIsoTimestamp } from '@/components/activity/activityFormat';
import { Phase2LaneAdvisoryBadge } from '@/components/omegaPhase2/Phase2LaneAdvisoryBadge';
import { resolvePhase2AdvisoryDisplay } from '@/lib/phase2LaneAdvisoryFormat';

interface Phase2ShadowTradeMobileCardProps {
  tradeRow: BridgeTradeLogRow;
}

export function Phase2ShadowTradeMobileCard({ tradeRow }: Phase2ShadowTradeMobileCardProps) {
  const advisoryDisplay = resolvePhase2AdvisoryDisplay(
    tradeRow.lane_advisory,
    tradeRow.decision,
    tradeRow.block_reason,
  );
  const isLong = tradeRow.direction === 'long' || tradeRow.direction === 'LONG';

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-slate-500">{formatActivityIsoTimestamp(tradeRow.created_at)}</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {isLong ? 'LONG' : 'SHORT'} · {tradeRow.pair}
          </p>
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {tradeRow.decision}
        </span>
      </div>

      <div className="mt-3">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">Gate signal</p>
        <div className="mt-1">
          <Phase2LaneAdvisoryBadge display={advisoryDisplay} />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-slate-500">Session</dt>
          <dd className="text-slate-800 dark:text-slate-200">{tradeRow.signal_session ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Status</dt>
          <dd className="text-slate-800 dark:text-slate-200">{tradeRow.status}</dd>
        </div>
        <div>
          <dt className="text-slate-500">R</dt>
          <dd className="font-mono text-slate-800 dark:text-slate-200">
            {tradeRow.pnl_r != null ? Number(tradeRow.pnl_r).toFixed(2) + 'R' : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">AMD</dt>
          <dd className={`font-medium ${amdTagColor(tradeRow.amd_tag ?? null)}`}>
            {tradeRow.amd_tag ? amdTagLabel(tradeRow.amd_tag) : '—'}
          </dd>
        </div>
      </dl>

      {tradeRow.lane_advisory ? (
        <p className="mt-2 font-mono text-[10px] text-slate-500 dark:text-slate-400">{tradeRow.lane_advisory}</p>
      ) : null}
    </article>
  );
}
