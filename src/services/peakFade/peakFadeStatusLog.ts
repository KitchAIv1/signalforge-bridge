/** Throttled Peak Fade status lines so ops can see idle / gated ticks. */

import { peakFadeLog, peakFadeWarn } from './peakFadeLogger.js';

const THROTTLE_MS = 5 * 60 * 1000;
let lastGateWarnMs = 0;
let lastIdleLogMs = 0;

export function logPeakFadeConfigGateOnce(): void {
  const now = Date.now();
  if (now - lastGateWarnMs < THROTTLE_MS) return;
  lastGateWarnMs = now;
  peakFadeWarn(
    'env ON but bridge_config peak_fade_enabled is false — monitors idle',
  );
}

export function logPeakFadeIdleTick(detail: string): void {
  const now = Date.now();
  if (now - lastIdleLogMs < THROTTLE_MS) return;
  lastIdleLogMs = now;
  peakFadeLog(`idle — ${detail}`);
}
