'use client';

import { useCombinedStackStatus } from '@/hooks/useCombinedStackStatus';
import {
  deriveAoFireStatus,
  formatAmdTodayLine,
  type AoFireStatusVariant,
  type CombinedStackLever,
} from '@/lib/combinedStackStatusModel';
import { amdTagColor, amdTagLabel } from '@/lib/amdPanelFormatters';

const STATUS_DOT_CLASSES: Record<AoFireStatusVariant, string> = {
  firing: 'bg-emerald-500',
  gated: 'bg-rose-500',
  shadow_gated: 'bg-amber-500',
  tag_pending: 'bg-sky-500',
  gate_off: 'bg-slate-400',
};

const STATUS_TEXT_CLASSES: Record<AoFireStatusVariant, string> = {
  firing: 'text-emerald-700 dark:text-emerald-300',
  gated: 'text-rose-700 dark:text-rose-300',
  shadow_gated: 'text-amber-700 dark:text-amber-300',
  tag_pending: 'text-sky-700 dark:text-sky-300',
  gate_off: 'text-slate-600 dark:text-slate-300',
};

function LeverPill({ lever }: { lever: CombinedStackLever }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide ${
        lever.enabled
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-slate-300/60 bg-slate-100/60 text-slate-500 dark:border-slate-600/60 dark:bg-slate-800/60 dark:text-slate-400'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          lever.enabled ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-500'
        }`}
      />
      {lever.label}
    </span>
  );
}

/**
 * Read-only status card: will AO fire today, lever states, and today's AMD
 * trade at a glance. Display only — all behavior lives bridge-side.
 */
export function CombinedStackStatusCard() {
  const statusData = useCombinedStackStatus();
  if (!statusData) return null;

  const fireStatus = deriveAoFireStatus({
    gateEnabled: statusData.gateEnabled,
    amdTag: statusData.amdToday.tag,
    tagWrittenAtIso: statusData.amdToday.tagWrittenAtIso,
    nowMs: Date.now(),
    gateBlocksToday: statusData.gateBlocksToday,
  });
  const isGated = fireStatus.variant === 'gated';

  return (
    <div className="mt-3 rounded-xl border border-slate-200/80 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/40">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
          Combined Stack
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {statusData.levers.map((lever) => (
            <LeverPill key={lever.label} lever={lever} />
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2.5">
        <span className="relative mt-1 flex h-2.5 w-2.5">
          {isGated ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
          ) : null}
          <span
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${STATUS_DOT_CLASSES[fireStatus.variant]}`}
          />
        </span>
        <div>
          <p className={`text-sm font-semibold ${STATUS_TEXT_CLASSES[fireStatus.variant]}`}>
            {fireStatus.headline}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {fireStatus.detail}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
          AMD today
        </span>
        {statusData.amdToday.tag ? (
          <span className={`text-xs font-medium ${amdTagColor(statusData.amdToday.tag)}`}>
            {amdTagLabel(statusData.amdToday.tag)}
          </span>
        ) : (
          <span className="text-xs text-slate-400 dark:text-slate-500">no tag yet</span>
        )}
        <span className="text-xs text-slate-600 dark:text-slate-300">
          {formatAmdTodayLine(statusData.amdToday)}
        </span>
      </div>
    </div>
  );
}
