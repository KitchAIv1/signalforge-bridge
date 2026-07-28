/**
 * ALPHAOMEGA entry gate — replaces the legacy R1/Phase2 gates
 * (omegaPhase2EntryGate.ts) for Lane B. Enters only on a validated
 * "founding streak crack" whose direction matches the incoming signal, with
 * no position already open, outside the Asia-open entry blackout, founding
 * speed above ENTRY_SPEED_FLOOR_MIN, and outside the CF-C mid-band (45, 60].
 * Keep bands: (35, 45] and >60. Floor ≤35 → SPEEDFLOOR shadow; mid-band →
 * SPEEDBAND shadow (forensics only — not wired into SPEEDFLOOR paper sim).
 *
 * Legacy R1/Phase2 files are left in place (not deleted) for easy rollback;
 * they are simply no longer called from the Lane B fan-out branch.
 */

import {
  ALPHAOMEGA_BLOCK_ALREADY_OPEN,
  ALPHAOMEGA_BLOCK_ENTRY_BLACKOUT,
  ALPHAOMEGA_BLOCK_NO_CRACK,
  ALPHAOMEGA_BLOCK_SPEED_FLOOR,
  ALPHAOMEGA_BLOCK_SPEED_MID_BAND,
  isAtOrBelowEntrySpeedFloor,
  isInAlphaOmegaDroppedSpeedMidBand,
  roundAdvisorySpeedMin,
} from './alphaOmegaConstants.js';
import { isAlphaOmegaEntryBlackoutUtc } from './alphaOmegaEntryBlackout.js';
import type { AlphaOmegaDirection, CrackEvent } from './alphaOmegaStreakTracker.js';

export interface AlphaOmegaEntryGateInput {
  crackEvent: CrackEvent | null;
  direction: AlphaOmegaDirection;
  hasOpenPosition: boolean;
  /** Injected clock for tests; defaults to now. */
  asOf?: Date;
}

export interface AlphaOmegaEntryGateResult {
  enter: boolean;
  blockReason: string | null;
  /** Set when the speed floor is the ONLY reason blocking — counterfactual
   * for comparing real (with-filter) vs shadow (without-filter) performance
   * on new live data, directly addressing the overfitting concern flagged
   * during research. Mid-band uses a distinct SPEEDBAND shadow (not paper). */
  shadowAdvisory: string | null;
  foundingLength: number | null;
  foundingSpeedMin: number | null;
}

export function evaluateAlphaOmegaEntryGate(input: AlphaOmegaEntryGateInput): AlphaOmegaEntryGateResult {
  const { crackEvent, direction, hasOpenPosition, asOf = new Date() } = input;

  if (!crackEvent || crackEvent.enterDirection !== direction) {
    return { enter: false, blockReason: ALPHAOMEGA_BLOCK_NO_CRACK, shadowAdvisory: null, foundingLength: null, foundingSpeedMin: null };
  }

  if (hasOpenPosition) {
    return {
      enter: false,
      blockReason: ALPHAOMEGA_BLOCK_ALREADY_OPEN,
      shadowAdvisory: null,
      foundingLength: crackEvent.foundingLength,
      foundingSpeedMin: crackEvent.foundingSpeedMin,
    };
  }

  if (isAlphaOmegaEntryBlackoutUtc(asOf)) {
    return {
      enter: false,
      blockReason: ALPHAOMEGA_BLOCK_ENTRY_BLACKOUT,
      shadowAdvisory: null,
      foundingLength: crackEvent.foundingLength,
      foundingSpeedMin: crackEvent.foundingSpeedMin,
    };
  }

  // Advisory-rounded inclusive floor: raw 35.04 → 35.0 → block (CF/advisory parity).
  if (isAtOrBelowEntrySpeedFloor(crackEvent.foundingSpeedMin)) {
    const advisorySpeed = roundAdvisorySpeedMin(crackEvent.foundingSpeedMin);
    return {
      enter: false,
      blockReason: ALPHAOMEGA_BLOCK_SPEED_FLOOR,
      shadowAdvisory: `ALPHAOMEGA_SPEEDFLOOR_SHADOW:would_enter:${direction}:speed=${advisorySpeed.toFixed(1)}m:len=${crackEvent.foundingLength}`,
      foundingLength: crackEvent.foundingLength,
      foundingSpeedMin: crackEvent.foundingSpeedMin,
    };
  }

  // CF-C: drop advisory (45, 60] — keep (35, 45] and >60.
  if (isInAlphaOmegaDroppedSpeedMidBand(crackEvent.foundingSpeedMin)) {
    const advisorySpeed = roundAdvisorySpeedMin(crackEvent.foundingSpeedMin);
    return {
      enter: false,
      blockReason: ALPHAOMEGA_BLOCK_SPEED_MID_BAND,
      shadowAdvisory: `ALPHAOMEGA_SPEEDBAND_SHADOW:would_enter:${direction}:speed=${advisorySpeed.toFixed(1)}m:len=${crackEvent.foundingLength}`,
      foundingLength: crackEvent.foundingLength,
      foundingSpeedMin: crackEvent.foundingSpeedMin,
    };
  }

  return {
    enter: true,
    blockReason: null,
    shadowAdvisory: null,
    foundingLength: crackEvent.foundingLength,
    foundingSpeedMin: crackEvent.foundingSpeedMin,
  };
}
