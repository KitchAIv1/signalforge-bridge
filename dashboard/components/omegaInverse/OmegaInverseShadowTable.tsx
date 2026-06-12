'use client';

import {
  deriveDtwDirection,
  formatDirectionLabel,
  formatUtcTime,
} from '@/lib/omegaInverseHelpers';
import type { ShadowSignal } from '@/lib/omegaInverseTypes';

type ShadowTableProps = {
  shadowSignals: ShadowSignal[];
};

function formatOptionalR(value: number | null): string {
  if (value == null) return '—';
  return value.toFixed(2);
}

export function OmegaInverseShadowTable({ shadowSignals }: ShadowTableProps) {
  return (
    <section>
      <p className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-400">
        SHORT→LONG — shadow accumulation only
      </p>
      {shadowSignals.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          No shadow signals yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">DTW dir</th>
                <th className="px-3 py-2">Would exec</th>
                <th className="px-3 py-2">Entry</th>
                <th className="px-3 py-2">SL</th>
                <th className="px-3 py-2">Session</th>
                <th className="px-3 py-2">Regime</th>
                <th className="px-3 py-2">MFE R</th>
                <th className="px-3 py-2">MAE R</th>
              </tr>
            </thead>
            <tbody>
              {shadowSignals.map((row) => (
                <tr key={row.fired_at} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                    {formatUtcTime(row.fired_at)} {row.fired_at.slice(0, 10)}
                  </td>
                  <td className="px-3 py-2">{formatDirectionLabel(deriveDtwDirection(row.direction))}</td>
                  <td className="px-3 py-2">{formatDirectionLabel(row.direction)}</td>
                  <td className="px-3 py-2">{row.entry_price}</td>
                  <td className="px-3 py-2">{row.sl_price}</td>
                  <td className="px-3 py-2">{row.session}</td>
                  <td className="px-3 py-2">{row.regime}</td>
                  <td className="px-3 py-2">{formatOptionalR(row.mfe_r)}</td>
                  <td className="px-3 py-2">{formatOptionalR(row.mae_r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
