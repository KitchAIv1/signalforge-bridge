'use client';

import { AlphaOmegaOpenRiskCard } from '@/components/omegaPhase2/AlphaOmegaOpenRiskCard';
import { AlphaOmegaStreakRadar } from '@/components/omegaPhase2/AlphaOmegaStreakRadar';
import { useAlphaOmegaLiveState } from '@/hooks/useAlphaOmegaLiveState';

export function AlphaOmegaLiveMachinePanel() {
  const { streak, openPosition, loading, errorMessage } = useAlphaOmegaLiveState();

  return (
    <div className="space-y-2">
      {errorMessage ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">Live state: {errorMessage}</p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <AlphaOmegaStreakRadar streak={streak} isLoading={loading} />
        <AlphaOmegaOpenRiskCard openPosition={openPosition} isLoading={loading} />
      </div>
      <p className="text-[11px] text-slate-500">Live state refreshes every 15s</p>
    </div>
  );
}
