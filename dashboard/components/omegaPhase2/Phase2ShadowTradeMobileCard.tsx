'use client';

import type { BridgeTradeLogRow } from '@/lib/types';
import { formatActivityIsoTimestamp } from '@/components/activity/activityFormat';
import { Phase2LaneAdvisoryBadge } from '@/components/omegaPhase2/Phase2LaneAdvisoryBadge';
import { Phase2PaperPnlCell } from '@/components/omegaPhase2/Phase2PaperPnlCell';
import { resolvePhase2AdvisoryDisplay } from '@/lib/phase2LaneAdvisoryFormat';
import { formatCloseReason } from '@/lib/formatCloseReason';
import { formatAlphaOmegaBlockReason } from '@/lib/alphaOmegaAdvisoryParse';
import { isSpeedfloorShadowRow } from '@/lib/alphaOmegaPaper/isSpeedfloorShadowRow';
import type { SpeedfloorPaperOutcome } from '@/lib/alphaOmegaPaper/paperSimTypes';
import {
  formatDurationMinutes,
  formatSignedDollars,
  formatSignedPips,
  foundingCellText,
  pnlToneClass,
} from '@/lib/alphaOmegaTradeDisplay';

interface Phase2ShadowTradeMobileCardProps {
  tradeRow: BridgeTradeLogRow;
  onSelectTrade?: (tradeRow: BridgeTradeLogRow) => void;
  paperOutcome?: SpeedfloorPaperOutcome;
  paperLoading?: boolean;
}

function exitOrBlockLabel(tradeRow: BridgeTradeLogRow): string {
  if (tradeRow.decision === 'BLOCKED') {
    return formatAlphaOmegaBlockReason(tradeRow.block_reason);
  }
  return formatCloseReason(tradeRow.close_reason);
}

export function Phase2ShadowTradeMobileCard({
  tradeRow,
  onSelectTrade,
  paperOutcome,
  paperLoading = false,
}: Phase2ShadowTradeMobileCardProps) {
  const isLong = tradeRow.direction === 'long' || tradeRow.direction === 'LONG';
  return (
    <article
      className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${
        onSelectTrade ? 'cursor-pointer' : ''
      }`}
      onClick={onSelectTrade ? () => onSelectTrade(tradeRow) : undefined}
    >
      <MobileCardHeader tradeRow={tradeRow} isLong={isLong} />
      <MobileCardBody
        tradeRow={tradeRow}
        paperOutcome={paperOutcome}
        paperLoading={paperLoading}
      />
    </article>
  );
}

function MobileCardHeader({
  tradeRow,
  isLong,
}: {
  tradeRow: BridgeTradeLogRow;
  isLong: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="text-xs text-slate-500">{formatActivityIsoTimestamp(tradeRow.created_at)}</p>
        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {isLong ? 'LONG' : 'SHORT'} · {tradeRow.pair}
        </p>
      </div>
      <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
        {tradeRow.decision === 'EXECUTED' ? 'TAKEN' : tradeRow.decision}
      </span>
    </div>
  );
}

function MobileCardBody({
  tradeRow,
  paperOutcome,
  paperLoading,
}: {
  tradeRow: BridgeTradeLogRow;
  paperOutcome?: SpeedfloorPaperOutcome;
  paperLoading: boolean;
}) {
  const advisoryDisplay = resolvePhase2AdvisoryDisplay(
    tradeRow.lane_advisory,
    tradeRow.decision,
    tradeRow.block_reason,
  );
  const toneClass = pnlToneClass(tradeRow.result, tradeRow.pnl_pips);
  const speedfloor = isSpeedfloorShadowRow(tradeRow);
  return (
    <>
      <div className="mt-3">
        <Phase2LaneAdvisoryBadge display={advisoryDisplay} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-slate-500">Founding</dt>
          <dd className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
            {foundingCellText(tradeRow.lane_advisory)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Exit / block</dt>
          <dd className="text-slate-800 dark:text-slate-200">
            {speedfloor && paperOutcome?.exitTrigger
              ? paperOutcome.status === 'paper_open'
                ? 'Paper open'
                : `Paper · ${paperOutcome.exitTrigger}`
              : exitOrBlockLabel(tradeRow)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">{speedfloor ? 'Paper PnL' : 'PnL'}</dt>
          <dd className={`font-mono tabular-nums ${toneClass}`}>
            {speedfloor ? (
              <Phase2PaperPnlCell outcome={paperOutcome} loading={paperLoading} />
            ) : (
              <>
                {formatSignedPips(tradeRow.pnl_pips)} ·{' '}
                {formatSignedDollars(tradeRow.pnl_dollars)}
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Hold</dt>
          <dd className="tabular-nums text-slate-800 dark:text-slate-200">
            {speedfloor
              ? paperOutcome?.holdMinutes != null
                ? formatDurationMinutes(paperOutcome.holdMinutes)
                : '—'
              : formatDurationMinutes(tradeRow.duration_minutes)}
          </dd>
        </div>
      </dl>
    </>
  );
}
