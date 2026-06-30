'use client';

import { AudusdFadeDirectionPill } from '@/components/audusdFade/AudusdFadeDirectionPill';
import { AudusdFadeResultPill } from '@/components/audusdFade/AudusdFadeResultPill';
import { AUDUSD_FADE_MAX_TRADES_DAY } from '@/lib/audusdFadeConstants';
import {
  computeTradeDurationMinutes,
  effectivePnlPips,
  isFadeTradeSuccessful,
} from '@/lib/audusdFadeStats';
import type { AudusdFadeTradeRow } from '@/lib/audusdFadeTypes';

type TodayPanelProps = {
  todayRows: AudusdFadeTradeRow[];
  openRows: AudusdFadeTradeRow[];
};

function formatPrice(value: number | null | undefined): string {
  return value != null ? value.toFixed(5) : '—';
}

function formatPips(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}p`;
}

function formatUtcTime(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(11, 16);
}

function TodayTradeRow({ row }: { row: AudusdFadeTradeRow }) {
  const pnl = effectivePnlPips(row);
  const duration = computeTradeDurationMinutes(row);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 py-2 text-sm last:border-b-0 dark:border-slate-800">
      <span className="font-mono text-slate-500">{formatUtcTime(row.opened_at)}</span>
      <AudusdFadeDirectionPill direction={row.direction} />
      <AudusdFadeResultPill result={row.result} successful={isFadeTradeSuccessful(row)} />
      <span className="text-slate-600 dark:text-slate-400">
        entry {formatPrice(row.entry_price)}
      </span>
      <span className="text-slate-600 dark:text-slate-400">
        ext {formatPips(row.ext_pips)}
      </span>
      {pnl != null ? (
        <span className={pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatPips(pnl)}</span>
      ) : null}
      {duration != null ? (
        <span className="text-xs text-slate-500">{duration}m</span>
      ) : null}
    </div>
  );
}

export function AudusdFadeTodayPanel({ todayRows, openRows }: TodayPanelProps) {
  const openTrade = openRows[0] ?? null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Today</h2>

      <div className="mt-3 space-y-3 text-sm">
        <div className="flex flex-wrap gap-4 text-slate-600 dark:text-slate-400">
          <span>
            Trades today:{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              {todayRows.length}/{AUDUSD_FADE_MAX_TRADES_DAY}
            </strong>
          </span>
          <span>
            Open position:{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              {openTrade ? 'Yes' : 'None'}
            </strong>
          </span>
        </div>

        {openTrade ? (
          <div className="rounded border border-sky-300/60 bg-sky-50 px-3 py-2 dark:border-sky-700/50 dark:bg-sky-950/30">
            <p className="text-xs font-medium uppercase tracking-wide text-sky-800 dark:text-sky-200">
              Open trade
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AudusdFadeDirectionPill direction={openTrade.direction} />
              <span className="text-slate-700 dark:text-slate-300">
                {formatPrice(openTrade.entry_price)} · TP {formatPrice(openTrade.tp_price)} · SL{' '}
                {formatPrice(openTrade.sl_price)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Extension {formatPips(openTrade.ext_pips)} · EUR aligned {formatPips(openTrade.aligned_eur)}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-4 space-y-1">
        {todayRows.length === 0 ? (
          <p className="text-sm text-slate-500">No fade trades today.</p>
        ) : (
          todayRows.map((row) => <TodayTradeRow key={row.id} row={row} />)
        )}
      </div>
    </section>
  );
}
