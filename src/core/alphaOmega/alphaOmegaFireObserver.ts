/**
 * ALPHAOMEGA fire observer — counts open-session Omega Bridge signals toward
 * streak / opposing-pressure BEFORE validateSignal (incl. the 4-pip floor).
 * Closed-market (weekend) inserts are ignored so ghost fires cannot arm/crack.
 * Open-session EXECUTED + BLOCKED alike still match the research fire stream.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalInsertPayload } from '../../connectors/supabase.js';
import { logWarn } from '../../utils/logger.js';
import { isForexMarketOpen } from '../../utils/time.js';
import { ALPHAOMEGA_ENABLED_CONFIG_KEY } from './alphaOmegaConstants.js';
import { trackFireAgainstOpenPositions } from './alphaOmegaPositionTracking.js';
import {
  recordFireAndDetectCrack,
  type CrackEvent,
} from './alphaOmegaStreakTracker.js';
import {
  isOmegaEnginePayload,
  readOmegaFireDirection,
  readOmegaFireTimestamp,
  readOmegaSignalId,
} from './alphaOmegaFireIdentity.js';

/** Matches bridgeConfig default for weekendCloseBufferMinutes. */
const DEFAULT_OBSERVE_MARKET_BUFFER_MINUTES = 30;

/** True only when FX session is open — closed-session ghosts must not touch streak. */
export function shouldObserveAlphaOmegaFire(
  now: Date = new Date(),
  bufferMinutes: number = DEFAULT_OBSERVE_MARKET_BUFFER_MINUTES,
): boolean {
  return isForexMarketOpen(now, bufferMinutes);
}

export interface AlphaOmegaFireOutcome {
  crackEvent: CrackEvent | null;
  /** False when an open Lane B position closed this fire for a non-backstop reason. */
  entryEligibleThisFire: boolean;
  observed: boolean;
}

export const EMPTY_ALPHAOMEGA_FIRE_OUTCOME: AlphaOmegaFireOutcome = {
  crackEvent: null,
  entryEligibleThisFire: true,
  observed: false,
};

export async function isAlphaOmegaEnabled(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', ALPHAOMEGA_ENABLED_CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return true;
  return data.config_value === true || data.config_value === 'true';
}

/**
 * Observes one Omega fire. Safe no-op for non-omega / disabled / incomplete ids.
 * Failures never throw to the router — streak miss is logged, trading continues.
 */
export async function observeAlphaOmegaFire(
  supabase: SupabaseClient,
  payload: SignalInsertPayload,
): Promise<AlphaOmegaFireOutcome> {
  if (!isOmegaEnginePayload(payload)) return EMPTY_ALPHAOMEGA_FIRE_OUTCOME;
  if (!shouldObserveAlphaOmegaFire()) return EMPTY_ALPHAOMEGA_FIRE_OUTCOME;
  try {
    if (!(await isAlphaOmegaEnabled(supabase))) return EMPTY_ALPHAOMEGA_FIRE_OUTCOME;
    return await recordObservedOmegaFire(supabase, payload);
  } catch (err) {
    logWarn('[AlphaOmega] early fire observe failed — continuing', {
      signalId: readOmegaSignalId(payload),
      error: String(err),
    });
    return EMPTY_ALPHAOMEGA_FIRE_OUTCOME;
  }
}

async function recordObservedOmegaFire(
  supabase: SupabaseClient,
  payload: SignalInsertPayload,
): Promise<AlphaOmegaFireOutcome> {
  const direction = readOmegaFireDirection(payload);
  const signalId = readOmegaSignalId(payload);
  if (!direction || !signalId) return EMPTY_ALPHAOMEGA_FIRE_OUTCOME;

  const firedAt = readOmegaFireTimestamp(payload);
  const crackEvent = await recordFireAndDetectCrack(supabase, {
    direction,
    firedAt,
    signalId,
  });
  const tracking = await trackFireAgainstOpenPositions(
    supabase,
    { direction, firedAt, signalId },
    crackEvent,
  );
  return {
    crackEvent,
    entryEligibleThisFire: !tracking.closedForOtherReason,
    observed: true,
  };
}

export function crackForEntry(outcome: AlphaOmegaFireOutcome): CrackEvent | null {
  return outcome.entryEligibleThisFire ? outcome.crackEvent : null;
}
