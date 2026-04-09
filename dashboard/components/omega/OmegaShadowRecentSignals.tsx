import type { OmegaShadowSignalRow } from '@/lib/types';
import { OmegaShadowRecentSignalRow } from '@/components/omega/OmegaShadowRecentSignalRow';

interface OmegaShadowRecentSignalsProps {
  signals: OmegaShadowSignalRow[];
}

export function OmegaShadowRecentSignals({
  signals,
}: OmegaShadowRecentSignalsProps) {
  const previewCount = Math.min(20, signals.length);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
        Recent signals — last {previewCount}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 border-b border-slate-100">
              <th className="text-left pb-2 pr-3">Time</th>
              <th className="text-left pb-2 pr-3">Dir</th>
              <th className="text-left pb-2 pr-3">Session</th>
              <th className="text-left pb-2 pr-3">Regime</th>
              <th className="text-right pb-2 pr-3">Conf</th>
              <th className="text-right pb-2 pr-3">Spread/R</th>
              <th className="text-right pb-2 pr-3">R (pips)</th>
              <th className="text-right pb-2 pr-3">MFE</th>
              <th className="text-right pb-2">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {signals.slice(0, 20).map((row) => (
              <OmegaShadowRecentSignalRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
