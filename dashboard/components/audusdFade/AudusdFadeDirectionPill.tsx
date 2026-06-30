'use client';

type DirectionPillProps = {
  direction: 'long' | 'short' | null;
};

export function AudusdFadeDirectionPill({ direction }: DirectionPillProps) {
  if (direction === 'long') {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/20">
        ↑ LONG
      </span>
    );
  }
  if (direction === 'short') {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/20">
        ↓ SHORT
      </span>
    );
  }
  return <span className="text-slate-400">—</span>;
}
