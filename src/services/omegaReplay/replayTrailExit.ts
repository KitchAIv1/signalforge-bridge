/** Route trail simulation by replay config (legacy M5 vs live-faithful). */

import { simulateLiveFaithfulTrailExit } from './liveFaithfulTrailExit.js';
import { OMEGA_TRAIL_DIST_R } from './liveTrailConstants.js';
import { simulateOmegaTrailExit } from './trailExitEngine.js';
import type { ReplayConfig, TimestampedBar, TradeDirection, TrailExitResult } from './types.js';

export interface ReplayTrailExitParams {
  direction: TradeDirection;
  entryPrice: number;
  structureStop: number;
  entryTimeMs: number;
  bars: readonly TimestampedBar[];
  maxHoldMinutes: number;
  executionCostPips: number;
}

export function simulateReplayTrailExit(
  config: ReplayConfig,
  params: ReplayTrailExitParams,
): TrailExitResult {
  const trailDistR = config.trailDistR ?? OMEGA_TRAIL_DIST_R;
  const shared = { ...params, trailDistR };

  if (config.exitModel === 'live_faithful') {
    return simulateLiveFaithfulTrailExit(shared);
  }

  return simulateOmegaTrailExit(shared);
}
