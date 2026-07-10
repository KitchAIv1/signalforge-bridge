'use client';

import { useAlphaOmegaKillSwitch } from '@/hooks/useAlphaOmegaKillSwitch';
import {
  ALPHAOMEGA_BANNER_LABEL,
  ALPHAOMEGA_ENTRY_STREAK_LENGTH,
  ALPHAOMEGA_HARD_STOP_PIPS,
  ALPHAOMEGA_OPPOSING_FIRE_THRESHOLD,
  OMEGA_LANE_B_BROKER_ID,
} from '@/lib/omegaLaneBConstants';

export function Phase2FlagSummary() {
  const { enabled, toggleError, isSaving, handleToggle } = useAlphaOmegaKillSwitch();
  if (enabled == null) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <BannerCopy enabled={enabled} />
        <button
          type="button"
          onClick={() => void handleToggle()}
          disabled={isSaving}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
            enabled
              ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
              : 'border-slate-400 bg-slate-200/40 text-slate-700 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          {isSaving ? 'Saving…' : enabled ? 'Disable ALPHAOMEGA' : 'Enable ALPHAOMEGA'}
        </button>
      </div>
      {toggleError ? (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{toggleError}</p>
      ) : null}
    </div>
  );
}

function BannerCopy({ enabled }: { enabled: boolean }) {
  const modeLabel = enabled ? 'ENFORCE' : 'DISABLED — legacy fallback';
  return (
    <div>
      <p className="font-medium text-amber-800 dark:text-amber-200">
        {ALPHAOMEGA_BANNER_LABEL} — {modeLabel}
      </p>
      <p className="mt-1 text-slate-500 dark:text-slate-400">
        Broker: <span className="text-slate-700 dark:text-slate-200">{OMEGA_LANE_B_BROKER_ID}</span>{' '}
        (AUD_NEWWWW)
      </p>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {ALPHAOMEGA_ENTRY_STREAK_LENGTH}/45 crack · ≥30m floor · exit @
        {ALPHAOMEGA_OPPOSING_FIRE_THRESHOLD} opp / {ALPHAOMEGA_HARD_STOP_PIPS}p / backstop /
        max hold
      </p>
    </div>
  );
}
