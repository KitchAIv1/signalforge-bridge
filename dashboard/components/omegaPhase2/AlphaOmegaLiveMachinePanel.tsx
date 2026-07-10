'use client';

import { AlphaOmegaOpenRiskCard } from '@/components/omegaPhase2/AlphaOmegaOpenRiskCard';
import { AlphaOmegaStreakRadar } from '@/components/omegaPhase2/AlphaOmegaStreakRadar';
import { useAlphaOmegaLiveState } from '@/hooks/useAlphaOmegaLiveState';
import { describeOpenRiskBridge } from '@/lib/alphaOmegaStreakDisplay';

export function AlphaOmegaLiveMachinePanel() {
  const { streak, openPosition, lastExit, loading, errorMessage } = useAlphaOmegaLiveState();
  const bridge =
    openPosition != null ? describeOpenRiskBridge(openPosition, streak) : null;

  return (
    <div className="space-y-2">
      {errorMessage ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">Live state: {errorMessage}</p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <AlphaOmegaStreakRadar streak={streak} isLoading={loading} />
        <AlphaOmegaOpenRiskCard
          openPosition={openPosition}
          lastExit={lastExit}
          streak={streak}
          isLoading={loading}
        />
      </div>
      {bridge ? (
        <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
          {bridge}
        </p>
      ) : null}
      <p className="text-[11px] text-slate-500">Live state refreshes every 15s</p>
    </div>
  );
}
