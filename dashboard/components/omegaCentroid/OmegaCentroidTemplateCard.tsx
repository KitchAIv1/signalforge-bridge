'use client';

import {
  OMEGA_CENTROID_DEFAULT_THRESHOLD,
  OMEGA_CENTROID_FEATURE_LABELS,
  OMEGA_CENTROID_FREEZE_ISO,
  OMEGA_CENTROID_PAIR,
  OMEGA_CENTROID_PATTERN_ID,
  OMEGA_CENTROID_TIMEFRAME,
  OMEGA_CENTROID_WINDOW_BARS,
  OMEGA_FROZEN_W5_C0_CENTROID,
} from '@/lib/omegaCentroidConstants';

export function OmegaCentroidTemplateCard() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Active template (display mirror)
      </h2>
      <p className="mt-2 font-mono text-sm text-slate-900 dark:text-slate-100">
        {OMEGA_CENTROID_PATTERN_ID}
      </p>
      <TemplateMeta />
      <CentroidMatrix />
      <p className="mt-3 text-[11px] text-slate-500">
        Read-only mirror of engine-omega FROZEN_W5_C0_CENTROID. Live matching is
        unchanged by this page. Railway env OMEGA_SHADOW_MATCH_THRESHOLD can
        override the default threshold on the engine only.
      </p>
    </section>
  );
}

function TemplateMeta() {
  const freezeLabel = new Date(OMEGA_CENTROID_FREEZE_ISO).toLocaleDateString(
    'en-GB',
    { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' },
  );
  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
      <MetaItem label="Pair / TF" value={`${OMEGA_CENTROID_PAIR} ${OMEGA_CENTROID_TIMEFRAME}`} />
      <MetaItem label="Window" value={`${OMEGA_CENTROID_WINDOW_BARS} bars`} />
      <MetaItem label="Freeze" value={freezeLabel} />
      <MetaItem
        label="Default thr"
        value={OMEGA_CENTROID_DEFAULT_THRESHOLD.toFixed(6)}
      />
    </dl>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
        {value}
      </dd>
    </div>
  );
}

function CentroidMatrix() {
  const floats = OMEGA_FROZEN_W5_C0_CENTROID;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-[11px]">
        <thead>
          <tr className="border-b border-slate-100 text-slate-500 dark:border-slate-800">
            <th className="pb-1.5 pr-2 font-medium">Bar</th>
            {OMEGA_CENTROID_FEATURE_LABELS.map((label) => (
              <th key={label} className="pb-1.5 pr-2 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3, 4].map((barIndex) => (
            <tr
              key={barIndex}
              className="border-b border-slate-50 tabular-nums text-slate-700 dark:border-slate-800/80 dark:text-slate-300"
            >
              <td className="py-1 pr-2 font-medium">{barIndex + 1}</td>
              {OMEGA_CENTROID_FEATURE_LABELS.map((_, featureIndex) => {
                const value = floats[barIndex * 5 + featureIndex]!;
                return (
                  <td key={featureIndex} className="py-1 pr-2">
                    {value.toFixed(6)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
