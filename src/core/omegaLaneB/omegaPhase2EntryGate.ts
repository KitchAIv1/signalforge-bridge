import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyHybridSessionWindow } from '../omegaHybridEntryGate.js';
import {
  LANE_B_BLOCK_PHASE2_DIST,
  LANE_B_BLOCK_R1_FLIP,
  OMEGA_LANE_B_BROKER_ID,
} from './omegaLaneBConstants.js';
import { loadLaneBConfigFlags } from './omegaLaneBConfig.js';
import {
  loadFlipStateForBroker,
  shouldBlockLaneBFlipEntry,
  type FlipDirection,
} from './omegaFlipCooldownGate.js';
import { loadPhase2DayFlagsForBroker, utcTradeDateFromIso } from './omegaPhase2DayFlags.js';

export interface LaneBEntryGateInput {
  supabase: SupabaseClient;
  signalReceivedAt: string;
  direction: string;
  brokerId?: string;
}

export interface LaneBEntryGateResult {
  blocked: boolean;
  blockReason: string | null;
  shadowAdvisory: string | null;
}

function normDir(raw: string): FlipDirection | null {
  const d = raw.toLowerCase();
  if (d === 'long' || d === 'short') return d;
  return null;
}

function formatPhase2Advisory(flags: {
  twoPlusFlags: boolean;
  executionBleed: boolean;
  flipStormRaw: boolean;
  dayCautionAmd: boolean;
}): string {
  const parts: string[] = [];
  if (flags.executionBleed) parts.push('bleed');
  if (flags.flipStormRaw) parts.push('flip_storm');
  if (flags.dayCautionAmd) parts.push('day_caution');
  return `PHASE2_TWO_PLUS:${parts.join(',')}`;
}

export async function evaluateLaneBEntryGate(
  input: LaneBEntryGateInput,
): Promise<LaneBEntryGateResult> {
  const brokerId = input.brokerId ?? OMEGA_LANE_B_BROKER_ID;
  const direction = normDir(input.direction);
  if (!direction) {
    return { blocked: false, blockReason: null, shadowAdvisory: null };
  }

  const laneConfig = await loadLaneBConfigFlags(input.supabase);
  const flipState = await loadFlipStateForBroker(input.supabase, brokerId);

  if (
    laneConfig.r1Enforce &&
    shouldBlockLaneBFlipEntry(
      { signalReceivedAt: input.signalReceivedAt, direction },
      flipState,
    )
  ) {
    return {
      blocked: true,
      blockReason: LANE_B_BLOCK_R1_FLIP,
      shadowAdvisory: null,
    };
  }

  const tradeDate = utcTradeDateFromIso(input.signalReceivedAt);
  const dayFlags = await loadPhase2DayFlagsForBroker(input.supabase, tradeDate, brokerId);
  const session = classifyHybridSessionWindow(input.signalReceivedAt);
  const inDistWindow = session === 'dist_loose';

  if (!dayFlags.twoPlusFlags || !inDistWindow) {
    const shadowOnlyR1 =
      !laneConfig.r1Enforce &&
      laneConfig.phase2Shadow &&
      shouldBlockLaneBFlipEntry(
        { signalReceivedAt: input.signalReceivedAt, direction },
        flipState,
      );
    if (shadowOnlyR1) {
      return {
        blocked: false,
        blockReason: null,
        shadowAdvisory: `${LANE_B_BLOCK_R1_FLIP}:shadow`,
      };
    }
    return { blocked: false, blockReason: null, shadowAdvisory: null };
  }

  const advisory = formatPhase2Advisory(dayFlags);

  if (laneConfig.phase2Enforce) {
    return {
      blocked: true,
      blockReason: LANE_B_BLOCK_PHASE2_DIST,
      shadowAdvisory: advisory,
    };
  }

  if (laneConfig.phase2Shadow) {
    return {
      blocked: false,
      blockReason: null,
      shadowAdvisory: `${LANE_B_BLOCK_PHASE2_DIST}:shadow:${advisory}`,
    };
  }

  return { blocked: false, blockReason: null, shadowAdvisory: null };
}

export function isOmegaLaneBBroker(brokerId: string): boolean {
  return brokerId === OMEGA_LANE_B_BROKER_ID;
}
