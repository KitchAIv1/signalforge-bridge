import type { AmdAutoDirectionSnapshot, AsianCloseBiasSignal } from './amdTypes.js';

export function applyAsianCloseAdvisory(
  snapshot: AmdAutoDirectionSnapshot,
  asianCloseBiasSignal: AsianCloseBiasSignal,
  asianClosePositionPct: number | null,
): AmdAutoDirectionSnapshot {
  if (asianCloseBiasSignal === null || asianClosePositionPct === null) {
    return snapshot;
  }

  const auto = snapshot.auto_direction;
  const pctStr = asianClosePositionPct.toFixed(1);
  let suffix: string;

  if (auto !== 'long' && auto !== 'short') {
    suffix = ` [ASIAN_CLOSE_OBSERVED bias=${asianCloseBiasSignal} pct=${pctStr}]`;
  } else if (asianCloseBiasSignal === 'NEUTRAL') {
    suffix = ` [ASIAN_CLOSE_NEUTRAL pct=${pctStr}]`;
  } else {
    const biasDir = asianCloseBiasSignal === 'BULLISH' ? 'long' : 'short';
    const agree = biasDir === auto;
    suffix = agree
      ? ` [ASIAN_CLOSE_AGREE bias=${asianCloseBiasSignal} pct=${pctStr}]`
      : ` [ASIAN_CLOSE_DISAGREE bias=${asianCloseBiasSignal} pct=${pctStr} auto=${auto}]`;
  }

  return {
    ...snapshot,
    auto_direction_reason: `${snapshot.auto_direction_reason}${suffix}`,
  };
}
