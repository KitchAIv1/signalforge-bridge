'use client';

import { useAlphaOmegaDeadCrackAbortSwitch } from '@/hooks/useAlphaOmegaDeadCrackAbortSwitch';

const ABORT_TOOLTIP =
  'Closes a trade stuck 30m+ with <1.5p progress and 3p+ drawdown. Exit-only; entries and streak untouched.';

/** Config-only remote for alpha_omega_dead_crack_abort_enabled. No abort math. */
export function DeadCrackAbortToggle() {
  const { enabled, toggleError, isSaving, handleToggle } =
    useAlphaOmegaDeadCrackAbortSwitch();
  if (enabled == null) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-amber-500/20 pt-3">
      <div>
        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
          Dead-crack abort — {enabled ? 'ON' : 'OFF'}
        </p>
        <p
          className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400"
          title={ABORT_TOOLTIP}
        >
          {ABORT_TOOLTIP}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void handleToggle()}
        disabled={isSaving}
        title={ABORT_TOOLTIP}
        className={`rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
          enabled
            ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
            : 'border-slate-400 bg-slate-200/40 text-slate-700 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-300'
        }`}
      >
        {isSaving ? 'Saving…' : enabled ? 'Turn OFF' : 'Turn ON'}
      </button>
      {toggleError ? (
        <p className="w-full text-xs text-rose-600 dark:text-rose-400">{toggleError}</p>
      ) : null}
    </div>
  );
}
