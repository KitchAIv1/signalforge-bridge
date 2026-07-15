'use client';

import { OMEGA_CENTROID_DEFAULT_THRESHOLD } from '@/lib/omegaCentroidConstants';
import {
  distanceToneClass,
  formatDistance,
  type CentroidFireSample,
} from '@/lib/omegaCentroidHealthStats';

interface OmegaCentroidRecentFiresProps {
  fires: CentroidFireSample[];
  isLoading: boolean;
}

export function OmegaCentroidRecentFires({
  fires,
  isLoading,
}: OmegaCentroidRecentFiresProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Recent w5/c0 fires · distance vs default thr{' '}
        {OMEGA_CENTROID_DEFAULT_THRESHOLD.toFixed(3)}
      </h2>
      {isLoading && fires.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Loading…</p>
      ) : fires.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No w5/c0 shadow fires in the lookback window.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500 dark:border-slate-800">
                <th className="pb-2 pr-3 font-medium">Fired (UTC)</th>
                <th className="pb-2 pr-3 font-medium">Dir</th>
                <th className="pb-2 pr-3 font-medium">Session</th>
                <th className="pb-2 pr-3 text-right font-medium">Distance</th>
                <th className="pb-2 pr-3 text-right font-medium">% thr</th>
                <th className="pb-2 pr-3 text-right font-medium">Conf</th>
                <th className="pb-2 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {fires.map((fire) => (
                <FireRow key={fire.id} fire={fire} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FireRow({ fire }: { fire: CentroidFireSample }) {
  const thr = OMEGA_CENTROID_DEFAULT_THRESHOLD;
  const pctThr = (fire.centroidDistance / thr) * 100;
  const firedLabel = new Date(fire.firedAt).toLocaleString('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return (
    <tr className="border-b border-slate-50 dark:border-slate-800/60">
      <td className="py-1.5 pr-3 tabular-nums text-slate-700 dark:text-slate-300">
        {firedLabel}
      </td>
      <td className="py-1.5 pr-3 uppercase text-slate-800 dark:text-slate-200">
        {fire.direction}
      </td>
      <td className="py-1.5 pr-3 text-slate-600 dark:text-slate-400">
        {fire.session}
      </td>
      <td
        className={`py-1.5 pr-3 text-right tabular-nums font-medium ${distanceToneClass(
          fire.centroidDistance,
          thr,
        )}`}
      >
        {formatDistance(fire.centroidDistance)}
      </td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600 dark:text-slate-400">
        {pctThr.toFixed(0)}%
      </td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600 dark:text-slate-400">
        {fire.confidence.toFixed(3)}
      </td>
      <td className="py-1.5 text-slate-600 dark:text-slate-400">
        {fire.finalOutcome ?? '—'}
      </td>
    </tr>
  );
}
