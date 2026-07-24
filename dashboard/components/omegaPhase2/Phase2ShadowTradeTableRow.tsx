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

export const PHASE2_SHADOW_DESKTOP_COLUMN_COUNT = 10;

interface Phase2ShadowTradeTableRowProps {
  tradeRow: BridgeTradeLogRow;
  onSelectTrade?: (tradeRow: BridgeTradeLogRow) => void;
  paperOutcome?: SpeedfloorPaperOutcome;
  paperLoading?: boolean;
}

function decisionBadgeClass(decision: string): string {
  if (decision === 'EXECUTED') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';
  }
  if (decision === 'BLOCKED') {
    return 'bg-red-100 text-red-700 dark:bg-red-950/45 dark:text-red-300';
  }
  return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
}

function exitOrBlockLabel(
  tradeRow: BridgeTradeLogRow,
  paperOutcome?: SpeedfloorPaperOutcome,
): string {
  if (isSpeedfloorShadowRow(tradeRow) && paperOutcome?.exitTrigger) {
    if (paperOutcome.status === 'paper_open') return 'Paper open';
    return `Paper · ${paperOutcome.exitTrigger}`;
  }
  if (tradeRow.decision === 'BLOCKED') {
    return formatAlphaOmegaBlockReason(tradeRow.block_reason);
  }
  return formatCloseReason(tradeRow.close_reason);
}

export function Phase2ShadowTradeTableRow({
  tradeRow,
  onSelectTrade,
  paperOutcome,
  paperLoading = false,
}: Phase2ShadowTradeTableRowProps) {
  return (
    <tr
      className={`border-b border-slate-100 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50 ${
        onSelectTrade ? 'cursor-pointer' : ''
      }`}
      onClick={onSelectTrade ? () => onSelectTrade(tradeRow) : undefined}
    >
      <TradeRowCells
        tradeRow={tradeRow}
        paperOutcome={paperOutcome}
        paperLoading={paperLoading}
      />
    </tr>
  );
}

function TradeRowCells({
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
  const isLong = tradeRow.direction === 'long' || tradeRow.direction === 'LONG';
  const toneClass = pnlToneClass(tradeRow.result, tradeRow.pnl_pips);
  return (
    <>
      <TradeIdentityCells
        tradeRow={tradeRow}
        isLong={isLong}
        advisoryDisplay={advisoryDisplay}
      />
      <TradeOutcomeCells
        tradeRow={tradeRow}
        toneClass={toneClass}
        paperOutcome={paperOutcome}
        paperLoading={paperLoading}
      />
    </>
  );
}

function TradeIdentityCells({
  tradeRow,
  isLong,
  advisoryDisplay,
}: {
  tradeRow: BridgeTradeLogRow;
  isLong: boolean;
  advisoryDisplay: ReturnType<typeof resolvePhase2AdvisoryDisplay>;
}) {
  return (
    <>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
        {formatActivityIsoTimestamp(tradeRow.created_at)}
      </td>
      <td className="px-3 py-2 text-xs font-medium">
        {isLong ? (
          <span className="text-emerald-600 dark:text-emerald-400">LONG</span>
        ) : (
          <span className="text-red-600 dark:text-red-400">SHORT</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${decisionBadgeClass(tradeRow.decision)}`}
        >
          {tradeRow.decision === 'EXECUTED' ? 'TAKEN' : tradeRow.decision}
        </span>
      </td>
      <td className="px-3 py-2 text-xs">
        <Phase2LaneAdvisoryBadge display={advisoryDisplay} />
      </td>
      <td className="px-3 py-2 font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
        {foundingCellText(tradeRow.lane_advisory)}
      </td>
    </>
  );
}

function TradeOutcomeCells({
  tradeRow,
  toneClass,
  paperOutcome,
  paperLoading,
}: {
  tradeRow: BridgeTradeLogRow;
  toneClass: string;
  paperOutcome?: SpeedfloorPaperOutcome;
  paperLoading: boolean;
}) {
  const speedfloor = isSpeedfloorShadowRow(tradeRow);
  const holdLabel = speedfloor
    ? paperOutcome?.holdMinutes != null
      ? formatDurationMinutes(paperOutcome.holdMinutes)
      : '—'
    : formatDurationMinutes(tradeRow.duration_minutes);
  return (
    <>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {exitOrBlockLabel(tradeRow, paperOutcome)}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {speedfloor && paperOutcome?.status === 'paper_closed'
          ? 'paper'
          : tradeRow.status}
      </td>
      <td className={`px-3 py-2 text-xs font-medium tabular-nums ${toneClass}`}>
        {speedfloor ? (
          <Phase2PaperPnlCell outcome={paperOutcome} loading={paperLoading} />
        ) : (
          <>
            <div>{formatSignedPips(tradeRow.pnl_pips)}</div>
            <div className="text-[10px] opacity-80">
              {formatSignedDollars(tradeRow.pnl_dollars)}
            </div>
          </>
        )}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-600 dark:text-slate-400">
        {holdLabel}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {tradeRow.signal_session ?? '—'}
      </td>
    </>
  );
}
