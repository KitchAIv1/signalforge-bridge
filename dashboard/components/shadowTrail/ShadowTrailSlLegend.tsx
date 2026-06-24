'use client';

export function ShadowTrailSlLegend() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
      <p className="font-medium text-slate-800 dark:text-slate-100">SL comparison lanes (trail 0.5R, activation 0R)</p>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        <li>
          <span className="font-semibold text-slate-700 dark:text-slate-200">Baseline</span> — SL 1.5R both
          directions (current live label)
        </li>
        <li>
          <span className="font-semibold text-slate-700 dark:text-slate-200">Optimized</span> — SHORT 2.0R /
          LONG 3.0R (180d grid research)
        </li>
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        Baseline columns unchanged. Optimized columns are additive — null until migration 050 + resolver
        backfill.
      </p>
    </div>
  );
}
