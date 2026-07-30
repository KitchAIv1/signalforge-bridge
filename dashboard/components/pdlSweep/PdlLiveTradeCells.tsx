'use client';

import type { ConditionsMet, PdlSweepSignalRow } from '@/lib/pdlSweepTypes';
import { PDL_DETECTION_CRON_UTC } from '@/lib/pdlSweepConstants';
import {
  pdlLiveSideFromConditions,
  researchNetPipsForSide,
} from '@/lib/pdlWindowDirection';

function formatPips(value: number | null): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}p`;
}

type TradeCellsProps = {
  signalRow: PdlSweepSignalRow;
};

/**
 * Fill columns show the research book (H12−1.5 under live side), not broker fills.
 * Live entry cron is ~12:01 UTC; research H12 still measures the 12:00–13:00 hour.
 */
export function PdlLiveTradeCells({ signalRow }: TradeCellsProps) {
  const conditions = signalRow.conditions_met as ConditionsMet | null;
  if (!conditions) {
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

  const side = pdlLiveSideFromConditions(conditions);
  const netPips = researchNetPipsForSide(side, signalRow.outcome_h12_net_pips);
  const pending = signalRow.outcome_h12_net_pips == null;

  return (
    <>
      <td className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
        {side.toUpperCase()}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        ~{PDL_DETECTION_CRON_UTC}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">13:00</td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {pending ? (
          <span className="text-amber-400">Pending</span>
        ) : (
          <>
            {formatPips(netPips)}
            <span className="ml-1 text-slate-400">H12−1.5</span>
          </>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">research</td>
    </>
  );
}
