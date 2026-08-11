'use client';

import {
  aoTradeVenueChipLabel,
  resolveAoTradeVenueKind,
} from '@/lib/aoTradeVenueLabel';

const CHIP_CLASS_BY_KIND = {
  paper: 'bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200',
  oanda: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  vt: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-950/45 dark:text-cyan-200',
} as const;

interface AoTradeVenueChipProps {
  brokerId: string | null | undefined;
}

/** PAPER / OANDA / VT chip — omitted when broker is unknown. */
export function AoTradeVenueChip({ brokerId }: AoTradeVenueChipProps) {
  const label = aoTradeVenueChipLabel(brokerId);
  const kind = resolveAoTradeVenueKind(brokerId);
  if (!label || kind === 'unknown') return null;
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${CHIP_CLASS_BY_KIND[kind]}`}
      title={brokerId ?? undefined}
    >
      {label}
    </span>
  );
}
