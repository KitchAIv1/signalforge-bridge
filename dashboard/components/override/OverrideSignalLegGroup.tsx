'use client';

import type { SignalLegGroup } from '@/lib/overrideTradeLogEnrichment';
import { OverridePositionCard } from '@/components/override/OverridePositionCard';

interface OverrideSignalLegGroupProps {
  group: SignalLegGroup;
  confirmClose: string | null;
  closing: string | null;
  onClose: (tradeId: string) => void;
}

export function OverrideSignalLegGroup({
  group,
  confirmClose,
  closing,
  onClose,
}: OverrideSignalLegGroupProps) {
  const engineLabel = group.engineId ?? 'omega';

  return (
    <div className="rounded-xl border border-violet-800/60 bg-violet-950/10 p-3">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-violet-300">
        {engineLabel} — {group.trades.length} legs
      </div>
      <div className="flex flex-col gap-3">
        {group.trades.map((trade) => (
          <OverridePositionCard
            key={trade.id}
            trade={trade}
            confirmClose={confirmClose}
            closing={closing}
            onClose={onClose}
          />
        ))}
      </div>
    </div>
  );
}
