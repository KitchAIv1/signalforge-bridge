import type { PeakFadeStats } from '@/lib/peakFadeTypes';

export function PeakFadePageHeader({ stats }: { stats: PeakFadeStats }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
        Peak Fade
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        AUDUSD D1 extreme fade · TP9 · no SL · high-impact news T−2h / T+1h
      </p>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-300">
        <span>Open: {stats.openCount}</span>
        <span>Today: {stats.todayCount}</span>
        <span>Today net: {stats.todayNetPips}p</span>
        <span>
          Closed W: {stats.winCount}/{stats.closedCount}
        </span>
      </div>
    </header>
  );
}
