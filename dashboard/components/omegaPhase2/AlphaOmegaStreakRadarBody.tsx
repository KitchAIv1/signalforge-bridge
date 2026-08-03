'use client';

import type { AlphaOmegaStreakSnapshot } from '@/hooks/useAlphaOmegaLiveState';
import { useNowMs } from '@/hooks/useNowMs';
import { AlphaOmegaStepRail } from '@/components/omegaPhase2/AlphaOmegaStepRail';
import {
  StreakArmWindowMeter,
  StreakRadarAgeMeta,
  StreakRadarHeader,
  streakReasonToneClass,
} from '@/components/omegaPhase2/AlphaOmegaStreakRadarParts';
import {
  buildStreakRadarView,
  type StreakRadarViewModel,
} from '@/lib/alphaOmegaStreakRadarView';
import { ALPHAOMEGA_ENTRY_STREAK_LENGTH } from '@/lib/omegaLaneBConstants';

interface AlphaOmegaStreakRadarBodyProps {
  streak: AlphaOmegaStreakSnapshot;
  unarmedAgeOutEnabled: boolean;
}

export function AlphaOmegaStreakRadarBody({
  streak,
  unarmedAgeOutEnabled,
}: AlphaOmegaStreakRadarBodyProps) {
  const nowMs = useNowMs();
  const view = buildStreakRadarView(streak, nowMs, unarmedAgeOutEnabled);
  return <StreakRadarPanels streak={streak} nowMs={nowMs} view={view} />;
}

function StreakRadarPanels({
  streak,
  nowMs,
  view,
}: {
  streak: AlphaOmegaStreakSnapshot;
  nowMs: number;
  view: StreakRadarViewModel;
}) {
  return (
    <>
      <StreakRadarHeader
        dirLabel={view.dirLabel}
        length={view.length}
        badge={view.badge}
        tone={view.tone}
        armed={streak.armed}
      />
      <StreakRadarProgress streak={streak} view={view} />
      {view.reason ? (
        <p className={`mt-2 text-xs ${streakReasonToneClass(view.tone)}`}>
          {view.reason}
        </p>
      ) : null}
      <StreakRadarAgeMeta
        streak={streak}
        nowMs={nowMs}
        wallAgeMin={view.wallAgeMin}
        showResetHint={view.showResetHint}
        resetPending={view.tone === 'reset_pending'}
      />
    </>
  );
}

function StreakRadarProgress({
  streak,
  view,
}: {
  streak: AlphaOmegaStreakSnapshot;
  view: StreakRadarViewModel;
}) {
  return (
    <>
      <div className="mt-3">
        <AlphaOmegaStepRail
          filledSlots={view.filledSlots}
          totalSlots={ALPHAOMEGA_ENTRY_STREAK_LENGTH}
          overflow={view.overflow}
          accent={view.railAccent}
          label={`Streak ${view.filledSlots} of ${ALPHAOMEGA_ENTRY_STREAK_LENGTH}`}
        />
      </div>
      <StreakArmWindowMeter
        foundingMin={view.foundingMin}
        armed={streak.armed}
        alert={view.meterAlert}
      />
    </>
  );
}
