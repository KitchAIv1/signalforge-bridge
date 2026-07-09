'use client';

import type { BridgeTradeLogRow } from '@/lib/types';
import { formatActivityIsoTimestamp } from '@/components/activity/activityFormat';
import { Phase2LaneAdvisoryBadge } from '@/components/omegaPhase2/Phase2LaneAdvisoryBadge';
import { formatAlphaOmegaBlockReason } from '@/lib/alphaOmegaAdvisoryParse';
import { formatCloseReason } from '@/lib/formatCloseReason';
import { resolvePhase2AdvisoryDisplay } from '@/lib/phase2LaneAdvisoryFormat';
import {
  formatDurationMinutes,
  formatSignedDollars,
  formatSignedPips,
  foundingCellText,
  pnlToneClass,
} from '@/lib/alphaOmegaTradeDisplay';

interface AlphaOmegaTradeDetailDrawerProps {
  tradeRow: BridgeTradeLogRow | null;
  onClose: () => void;
}

export function AlphaOmegaTradeDetailDrawer({
  tradeRow,
  onClose,
}: AlphaOmegaTradeDetailDrawerProps) {
  if (!tradeRow) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <DrawerHeader tradeRow={tradeRow} onClose={onClose} />
        <DrawerBody tradeRow={tradeRow} />
      </aside>
    </div>
  );
}

function DrawerHeader({
  tradeRow,
  onClose,
}: {
  tradeRow: BridgeTradeLogRow;
  onClose: () => void;
}) {
  const isLong = tradeRow.direction === 'long' || tradeRow.direction === 'LONG';
  return (
    <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
      <div>
        <p className="text-xs text-slate-500">{formatActivityIsoTimestamp(tradeRow.created_at)}</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
          {isLong ? 'LONG' : 'SHORT'} · {tradeRow.pair}
        </h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Close
      </button>
    </header>
  );
}

function DrawerBody({ tradeRow }: { tradeRow: BridgeTradeLogRow }) {
  const advisoryDisplay = resolvePhase2AdvisoryDisplay(
    tradeRow.lane_advisory,
    tradeRow.decision,
    tradeRow.block_reason,
  );
  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
      <section>
        <p className="text-[11px] uppercase tracking-wide text-slate-500">Signal</p>
        <div className="mt-1">
          <Phase2LaneAdvisoryBadge display={advisoryDisplay} />
        </div>
      </section>
      <DecisionDetailGrid tradeRow={tradeRow} />
      <EconomicsSection tradeRow={tradeRow} />
      <IdsSection tradeRow={tradeRow} />
    </div>
  );
}

function DecisionDetailGrid({ tradeRow }: { tradeRow: BridgeTradeLogRow }) {
  const rows: Array<[string, string]> = [
    ['Founding', foundingCellText(tradeRow.lane_advisory)],
    [
      'Block',
      tradeRow.decision === 'BLOCKED'
        ? formatAlphaOmegaBlockReason(tradeRow.block_reason)
        : '—',
    ],
    ['Exit', formatCloseReason(tradeRow.close_reason)],
    ['Status', tradeRow.status],
    ['Result', tradeRow.result ?? '—'],
    ['Session', tradeRow.signal_session ?? '—'],
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 text-xs">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-slate-500">{label}</dt>
          <dd className="text-slate-800 dark:text-slate-200">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EconomicsSection({ tradeRow }: { tradeRow: BridgeTradeLogRow }) {
  const toneClass = pnlToneClass(tradeRow.result, tradeRow.pnl_pips);
  return (
    <section>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">Economics</p>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <PriceCell label="Fill" value={tradeRow.fill_price} />
        <PriceCell label="Exit" value={tradeRow.exit_price} />
        <PriceCell label="SL" value={tradeRow.stop_loss} />
        <PriceCell label="TP" value={tradeRow.take_profit} />
        <div>
          <dt className="text-slate-500">PnL</dt>
          <dd className={`font-mono tabular-nums ${toneClass}`}>
            {formatSignedPips(tradeRow.pnl_pips)} · {formatSignedDollars(tradeRow.pnl_dollars)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Hold</dt>
          <dd className="tabular-nums text-slate-800 dark:text-slate-200">
            {formatDurationMinutes(tradeRow.duration_minutes)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function IdsSection({ tradeRow }: { tradeRow: BridgeTradeLogRow }) {
  return (
    <>
      <section>
        <p className="text-[11px] uppercase tracking-wide text-slate-500">Ids</p>
        <p className="mt-1 break-all font-mono text-[11px] text-slate-600 dark:text-slate-400">
          signal {tradeRow.signal_id}
        </p>
      </section>
      {tradeRow.lane_advisory ? (
        <section>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Raw advisory</p>
          <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
            {tradeRow.lane_advisory}
          </p>
        </section>
      ) : null}
    </>
  );
}

function PriceCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
        {value != null ? Number(value).toFixed(5) : '—'}
      </dd>
    </div>
  );
}
