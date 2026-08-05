'use client';

import { useCombinedStackSwitch } from '@/hooks/useCombinedStackSwitch';

const STACK_TOOLTIP =
  'One switch for the validated combined stack: AO AMD-day gate + AMD dead-trade abort + AMD trail split 6/4. 45d counterfactual: both engines together -104p to +109p. Hard SL stays 15 (SQL-only).';

/** Master remote writing the three underlying keys together. Engines read only the individual keys. */
export function CombinedStackToggle() {
  const { stackState, toggleError, isSaving, handleToggle } = useCombinedStackSwitch();
  if (stackState == null) return null;

  const stateLabel =
    stackState === 'mixed' ? 'MIXED (some levers on)' : stackState.toUpperCase();
  const buttonLabel = isSaving
    ? 'Saving…'
    : stackState === 'on'
      ? 'Turn stack OFF'
      : stackState === 'mixed'
        ? 'Align stack ON'
        : 'Turn stack ON';

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-500/40 bg-sky-500/5 p-3">
      <div>
        <p className="text-xs font-semibold text-sky-800 dark:text-sky-200">
          COMBINED STACK — {stateLabel}
        </p>
        <p
          className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400"
          title={STACK_TOOLTIP}
        >
          {STACK_TOOLTIP}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void handleToggle()}
        disabled={isSaving}
        title={STACK_TOOLTIP}
        className={`rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
          stackState === 'on'
            ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
            : stackState === 'mixed'
              ? 'border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-200'
              : 'border-slate-400 bg-slate-200/40 text-slate-700 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-300'
        }`}
      >
        {buttonLabel}
      </button>
      {toggleError ? (
        <p className="w-full text-xs text-rose-600 dark:text-rose-400">{toggleError}</p>
      ) : null}
    </div>
  );
}
