'use client';

type ModePillProps = {
  liveArmed: boolean;
};

export function PdlSweepShadowPill({ liveArmed }: ModePillProps) {
  if (liveArmed) {
    return (
      <span className="ml-1 rounded px-1.5 py-0.5 text-xs font-semibold bg-emerald-900/20 text-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-400">
        LIVE
      </span>
    );
  }
  return (
    <span className="ml-1 rounded px-1.5 py-0.5 text-xs font-semibold bg-yellow-900/20 text-yellow-500 dark:bg-yellow-900/30 dark:text-yellow-400">
      SHADOW
    </span>
  );
}
