'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type {
  AlphaOmegaLastExitSnapshot,
  AlphaOmegaOpenPositionSnapshot,
  AlphaOmegaStreakSnapshot,
} from '@/hooks/useAlphaOmegaLiveState';
import { AlphaOmegaStepRail } from '@/components/omegaPhase2/AlphaOmegaStepRail';
import {
  ALPHAOMEGA_GIVEBACK_ACTIVATION_PIPS,
  ALPHAOMEGA_GIVEBACK_PIPS,
  ALPHAOMEGA_OPPOSING_FIRE_THRESHOLD,
} from '@/lib/omegaLaneBConstants';
import {
  directionToneClass,
  formatRelativeAge,
} from '@/lib/alphaOmegaLiveDisplay';
import { describeFlatNextNeed, streakThresholdSlots } from '@/lib/alphaOmegaStreakDisplay';
import { formatCloseReason } from '@/lib/formatCloseReason';

interface AlphaOmegaOpenRiskCardProps {
  openPosition: AlphaOmegaOpenPositionSnapshot | null;
  lastExit: AlphaOmegaLastExitSnapshot | null;
  streak: AlphaOmegaStreakSnapshot | null;
  isLoading: boolean;
}

export function AlphaOmegaOpenRiskCard({
  openPosition,
  lastExit,
  streak,
  isLoading,
}: AlphaOmegaOpenRiskCardProps) {
  if (isLoading && !openPosition) {
    return <RiskShell>Loading…</RiskShell>;
  }
  if (!openPosition) {
    return <FlatRiskState lastExit={lastExit} streak={streak} />;
  }
  return (
    <OpenRiskBody
      openPosition={openPosition}
      nearExit={openPosition.opposingFireCount >= ALPHAOMEGA_OPPOSING_FIRE_THRESHOLD - 1}
    />
  );
}

function FlatRiskState({
  lastExit,
  streak,
}: {
  lastExit: AlphaOmegaLastExitSnapshot | null;
  streak: AlphaOmegaStreakSnapshot | null;
}) {
  const nowMs = useNowMsTick();
  return (
    <RiskShell>
      <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">Flat</p>
      <p className="mt-1 text-sm text-slate-500">Waiting for crack entry</p>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {describeFlatNextNeed(streak)}
      </p>
      {lastExit ? <LastExitMeta lastExit={lastExit} nowMs={nowMs} /> : null}
    </RiskShell>
  );
}

function LastExitMeta({
  lastExit,
  nowMs,
}: {
  lastExit: AlphaOmegaLastExitSnapshot;
  nowMs: number;
}) {
  const pips =
    lastExit.pnlPips != null
      ? `${lastExit.pnlPips > 0 ? '+' : ''}${lastExit.pnlPips.toFixed(1)}p`
      : null;
  return (
    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
      Last exit:{' '}
      <span className="text-slate-800 dark:text-slate-200">
        {lastExit.direction.toUpperCase()} · {formatCloseReason(lastExit.closeReason)}
        {pips ? ` · ${pips}` : ''}
      </span>
      <span className="text-slate-400"> · {formatRelativeAge(lastExit.closedAt, nowMs)}</span>
    </p>
  );
}

function useNowMsTick(): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const tickId = window.setInterval(() => setNowMs(Date.now()), 5_000);
    return () => window.clearInterval(tickId);
  }, []);
  return nowMs;
}

function OpenRiskBody({
  openPosition,
  nearExit,
}: {
  openPosition: AlphaOmegaOpenPositionSnapshot;
  nearExit: boolean;
}) {
  const nowMs = useNowMsTick();
  const opposing = openPosition.opposingFireCount;
  const { filledSlots } = streakThresholdSlots(opposing, ALPHAOMEGA_OPPOSING_FIRE_THRESHOLD);
  const dirLabel = openPosition.direction.toUpperCase();
  return (
    <RiskShell accent={nearExit ? 'rose' : 'sky'}>
      <OpenRiskHeader dirLabel={dirLabel} entryFiredAt={openPosition.entryFiredAt} nowMs={nowMs} />
      {openPosition.brokerId ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{openPosition.brokerId}</p>
      ) : null}
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Opposing{' '}
        <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {opposing}/{ALPHAOMEGA_OPPOSING_FIRE_THRESHOLD}
        </span>
        <span className="text-slate-400"> · {openPosition.totalFireCount} fires total</span>
      </p>
      <div className="mt-3">
        <AlphaOmegaStepRail
          filledSlots={filledSlots}
          totalSlots={ALPHAOMEGA_OPPOSING_FIRE_THRESHOLD}
          accent={nearExit ? 'rose' : 'sky'}
          label={`Opposing ${filledSlots} of ${ALPHAOMEGA_OPPOSING_FIRE_THRESHOLD}`}
        />
      </div>
      <OpenRiskMeta openPosition={openPosition} nearExit={nearExit} />
    </RiskShell>
  );
}

function OpenRiskHeader({
  dirLabel,
  entryFiredAt,
  nowMs,
}: {
  dirLabel: string;
  entryFiredAt: string;
  nowMs: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <p className={`text-2xl font-semibold ${directionToneClass(dirLabel)}`}>{dirLabel}</p>
      <span className="text-[11px] font-semibold text-slate-500">
        Open · {formatRelativeAge(entryFiredAt, nowMs)}
      </span>
    </div>
  );
}

function OpenRiskMeta({
  openPosition,
  nearExit,
}: {
  openPosition: AlphaOmegaOpenPositionSnapshot;
  nearExit: boolean;
}) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
      <div>
        <dt>Entry</dt>
        <dd className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
          {openPosition.entryPrice != null ? openPosition.entryPrice.toFixed(5) : '—'}
        </dd>
      </div>
      <div>
        <dt>Next exit path</dt>
        <dd className="text-slate-800 dark:text-slate-200">
          {nearExit ? 'Opposing pressure' : 'Hard stop watching'}
        </dd>
      </div>
      <PeakGivebackMeta openPosition={openPosition} />
    </dl>
  );
}

function PeakGivebackMeta({ openPosition }: { openPosition: AlphaOmegaOpenPositionSnapshot }) {
  const peak = openPosition.peakFavorablePips;
  if (peak <= 0) return null;
  const armed = peak >= ALPHAOMEGA_GIVEBACK_ACTIVATION_PIPS;
  return (
    <>
      <div>
        <dt>Peak favorable</dt>
        <dd className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
          +{peak.toFixed(1)}p
        </dd>
      </div>
      <div>
        <dt>Giveback trail</dt>
        <dd className="text-slate-800 dark:text-slate-200">
          {armed ? `Armed · locks on ${ALPHAOMEGA_GIVEBACK_PIPS}p giveback` : `Arms at +${ALPHAOMEGA_GIVEBACK_ACTIVATION_PIPS}p`}
        </dd>
      </div>
    </>
  );
}

function RiskShell({
  children,
  accent,
}: {
  children: ReactNode;
  accent?: 'rose' | 'sky';
}) {
  const borderClass =
    accent === 'rose'
      ? 'border-rose-500/40 bg-rose-500/5'
      : accent === 'sky'
        ? 'border-sky-500/30 bg-sky-500/5'
        : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900';

  return (
    <section className={`rounded-lg border p-4 ${borderClass}`}>
      <h2 className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Open risk</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
