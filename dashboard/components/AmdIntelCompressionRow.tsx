import type { AmdState } from '@/lib/types';
import { triStateYesNo } from '@/lib/amdMetricPhrasing';

interface AmdIntelCompressionRowProps {
  amdState: AmdState | null;
}

export function AmdIntelCompressionRow({ amdState }: AmdIntelCompressionRowProps) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
      <span>Compression breakout: {amdState ? triStateYesNo(amdState.compression_breakout) : '—'}</span>
      <span>Delayed distribution: {amdState ? triStateYesNo(amdState.delayed_distribution) : '—'}</span>
    </div>
  );
}
