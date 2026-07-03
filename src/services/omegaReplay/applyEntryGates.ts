/** Entry gates for OMEGA sequenced replay — mirrors live signalRouter policy. */

import { evaluateHybridEntryGate } from '../../core/omegaHybridEntryGate.js';
import type { ReplayConfig, ReplayGateStatus, TradeDirection } from './types.js';

export interface EntryGateDecision {
  gateStatus: ReplayGateStatus;
  gateReason: string | null;
  sessionWindow: 'asian' | 'dist_loose' | 'outside';
}

function utcTradeDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function evaluateReplayEntryGate(
  firedAtIso: string,
  direction: TradeDirection,
  config: ReplayConfig,
): EntryGateDecision {
  const hybrid = evaluateHybridEntryGate(
    firedAtIso,
    direction,
    config.omegaDirectionByDate.get(utcTradeDate(firedAtIso)) ?? null,
  );

  if (config.rawMode) {
    return { gateStatus: 'executed', gateReason: null, sessionWindow: hybrid.session };
  }

  if (!hybrid.passed) {
    return {
      gateStatus: 'blocked_gate',
      gateReason: hybrid.reason,
      sessionWindow: hybrid.session,
    };
  }

  return { gateStatus: 'executed', gateReason: null, sessionWindow: hybrid.session };
}
