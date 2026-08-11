'use client';

import type { BridgeTradeLogRow } from '@/lib/types';

interface AlphaOmegaTradeIdsSectionProps {
  tradeRow: BridgeTradeLogRow;
}

/** Signal / broker / raw advisory — drawer footer only. */
export function AlphaOmegaTradeIdsSection({
  tradeRow,
}: AlphaOmegaTradeIdsSectionProps) {
  return (
    <>
      <section>
        <p className="text-[11px] uppercase tracking-wide text-slate-500">Ids</p>
        <p className="mt-1 break-all font-mono text-[11px] text-slate-600 dark:text-slate-400">
          signal {tradeRow.signal_id}
        </p>
        <p className="mt-1 break-all font-mono text-[11px] text-slate-600 dark:text-slate-400">
          broker {tradeRow.broker_id ?? '—'}
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
