/**
 * ALPHAOMEGA entry gate — replaces the legacy R1/Phase2 gates
 * (omegaPhase2EntryGate.ts) for Lane B. Enters only on a validated
 * "founding streak crack" whose direction matches the incoming signal, with
 * no position already open, and whose founding streak took longer than
 * ENTRY_SPEED_FLOOR_MIN to form (≤ floor → SPEEDFLOOR shadow, no fill).
 *
 * Legacy R1/Phase2 files are left in place (not deleted) for easy rollback;
 * they are simply no longer called from the Lane B fan-out branch.
 */

import {
  ALPHAOMEGA_BLOCK_ALREADY_OPEN,
  ALPHAOMEGA_BLOCK_NO_CRACK,
  ALPHAOMEGA_BLOCK_SPEED_FLOOR,
  ENTRY_SPEED_FLOOR_MIN,
} from './alphaOmegaConstants.js';
import type { AlphaOmegaDirection, CrackEvent } from './alphaOmegaStreakTracker.js';

export interface AlphaOmegaEntryGateInput {
  crackEvent: CrackEvent | null;
  direction: AlphaOmegaDirection;
  hasOpenPosition: boolean;
}

export interface AlphaOmegaEntryGateResult {
  enter: boolean;
  blockReason: string | null;
  /** Set when the speed floor is the ONLY reason blocking — counterfactual
   * for comparing real (with-filter) vs shadow (without-filter) performance
   * on new live data, directly addressing the overfitting concern flagged
   * during research. */
  shadowAdvisory: string | null;
  foundingLength: number | null;
  foundingSpeedMin: number | null;
}

export function evaluateAlphaOmegaEntryGate(input: AlphaOmegaEntryGateInput): AlphaOmegaEntryGateResult {
  const { crackEvent, direction, hasOpenPosition } = input;

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

  // Inclusive: speed=35.0 (common advisory) must not fill — CF drop was [30,35].
  if (crackEvent.foundingSpeedMin <= ENTRY_SPEED_FLOOR_MIN) {
    return {
      enter: false,
      blockReason: ALPHAOMEGA_BLOCK_SPEED_FLOOR,
      shadowAdvisory: `ALPHAOMEGA_SPEEDFLOOR_SHADOW:would_enter:${direction}:speed=${crackEvent.foundingSpeedMin.toFixed(1)}m:len=${crackEvent.foundingLength}`,
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
