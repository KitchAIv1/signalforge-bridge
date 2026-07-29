'use client';

import type { PdlWindowTradeRow } from '@/lib/pdlWindowTypes';

function formatPips(value: number | null): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}p`;
}

function formatPrice(value: number | null): string {
  return value != null ? value.toFixed(5) : '—';
}

type TradeCellsProps = {
  trades: PdlWindowTradeRow[] | undefined;
};

export function PdlLiveTradeCells({ trades }: TradeCellsProps) {
  if (!trades || trades.length === 0) {
    return (
      <>
        <td className="px-3 py-2 text-xs text-slate-500">—</td>
        <td className="px-3 py-2 text-xs text-slate-500">—</td>
        <td className="px-3 py-2 text-xs text-slate-500">—</td>
        <td className="px-3 py-2 text-xs text-slate-500">—</td>
        <td className="px-3 py-2 text-xs text-slate-500">—</td>
      </>
    );
  }

  const trade = trades[0];
  const open = trade.result == null;
  const side = trade.direction.toUpperCase();

  return (
    <>
      <td className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
        {side}
        {trades.length > 1 ? ` ×${trades.length}` : ''}
      </td>
      <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">
        {formatPrice(trade.entry_price)}
      </td>
      <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">
        {open ? 'open' : formatPrice(trade.exit_price)}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {open ? '—' : formatPips(trade.pnl_pips)}
        {!open && trade.pnl_dollars != null ? (
          <span className="ml-1 text-slate-400">
            (${trade.pnl_dollars.toFixed(2)})
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {open ? 'OPEN' : trade.result ?? trade.close_reason ?? '—'}
      </td>
    </>
  );
}
