import type {
  AmdAutoDirectionSnapshot,
  AmdTag,
  AutoDirection,
  DailyBiasAlignment,
  JudasDirection,
} from './amdTypes.js';

export type Layer4VoteWindow = '5' | '7';

export type ConflictedWeakD1AdvisoryInput = {
  amdTag: AmdTag;
  judasDirection: JudasDirection | null;
  layer4BullishCount: number | null;
  layer4BearishCount: number | null;
  layer4BullishCount7: number | null;
  layer4BearishCount7: number | null;
  dailyBiasAlignment: DailyBiasAlignment;
};

export function isConflictedWeakD1JudasFlagEnabled(): boolean {
  return process.env.AMD_CONFLICTED_WEAK_D1_JUDAS_ENABLED === 'true';
}

export function resolveLayer4VoteCountsForTag(
  amdTag: AmdTag,
  layer4BullishCount: number | null,
  layer4BearishCount: number | null,
  layer4BullishCount7: number | null,
  layer4BearishCount7: number | null,
): { bullish: number; bearish: number; voteWindow: Layer4VoteWindow } {
  if (
    amdTag === 'AMD_SHIFTED' &&
    layer4BullishCount7 != null &&
    layer4BearishCount7 != null
  ) {
    return {
      bullish: layer4BullishCount7,
      bearish: layer4BearishCount7,
      voteWindow: '7',
    };
  }
  return {
    bullish: layer4BullishCount ?? 0,
    bearish: layer4BearishCount ?? 0,
    voteWindow: '5',
  };
}

export function isWeakLayer4Vote(bullish: number, bearish: number): boolean {
  return bullish === 2 || bearish === 2;
}

function judasInversionDirection(
  judasDirection: JudasDirection | null,
): AutoDirection | null {
  if (judasDirection === 'UP') return 'short';
  if (judasDirection === 'DOWN') return 'long';
  return null;
}

export function buildConflictedWeakD1AdvisorySuffix(
  input: ConflictedWeakD1AdvisoryInput,
  currentAutoDirection: AutoDirection,
): string | null {
  if (!isConflictedWeakD1JudasFlagEnabled()) return null;
  if (input.dailyBiasAlignment !== 'CONFLICTED') return null;

  const votes = resolveLayer4VoteCountsForTag(
    input.amdTag,
    input.layer4BullishCount,
    input.layer4BearishCount,
    input.layer4BullishCount7,
    input.layer4BearishCount7,
  );
  if (!isWeakLayer4Vote(votes.bullish, votes.bearish)) return null;

  const wouldHaveJudas = judasInversionDirection(input.judasDirection);
  if (wouldHaveJudas == null) return null;

  return (
    ` [ADVISORY AMD_CONFLICTED_WEAK_D1_JUDAS vote=${votes.voteWindow}c ` +
    `${votes.bullish}up/${votes.bearish}dn ` +
    `would_have_judas=${wouldHaveJudas} actual_auto=${currentAutoDirection}]`
  );
}

export function applyConflictedWeakD1Advisory(
  snapshot: AmdAutoDirectionSnapshot,
  input: ConflictedWeakD1AdvisoryInput,
): AmdAutoDirectionSnapshot {
  const suffix = buildConflictedWeakD1AdvisorySuffix(
    input,
    snapshot.auto_direction,
  );
  if (suffix == null) return snapshot;

  console.log(
    `[AmdDetector] CONFLICTED_WEAK_D1_JUDAS advisory (no auto_direction change):` +
      suffix.trim(),
  );
  return {
    ...snapshot,
    auto_direction_reason: `${snapshot.auto_direction_reason}${suffix}`,
  };
}
