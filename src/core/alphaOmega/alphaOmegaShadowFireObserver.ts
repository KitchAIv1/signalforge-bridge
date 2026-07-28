/**
 * Shadow AO fire observer — isolated streak + paper exits/entries.
 * Never mutates live alpha_omega_streak_state or live positions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalInsertPayload } from '../../connectors/supabase.js';
import { logWarn } from '../../utils/logger.js';
import { ALPHAOMEGA_SHADOW_ENABLED_CONFIG_KEY } from './alphaOmegaConstants.js';
import {
  isOmegaEnginePayload,
  readOmegaFireDirection,
  readOmegaFireTimestamp,
  readOmegaSignalId,
} from './alphaOmegaFireIdentity.js';
import { shouldObserveAlphaOmegaFire } from './alphaOmegaFireObserver.js';
import { recordShadowFireAndDetectCrack } from './alphaOmegaShadowStreakTracker.js';
import { trackShadowFireAgainstOpenPositions } from './alphaOmegaShadowPositionTracking.js';
import { maybeEnterShadowPaperOnCrack } from './alphaOmegaShadowPaperEntry.js';
import type { CrackEvent } from './alphaOmegaStreakTracker.js';

export interface ShadowFireObserveResult {
  observed: boolean;
  crackEvent: CrackEvent | null;
  paperEntered: boolean;
}

export const EMPTY_SHADOW_FIRE_RESULT: ShadowFireObserveResult = {
  observed: false,
  crackEvent: null,
  paperEntered: false,
};

export async function isAlphaOmegaShadowEnabled(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', ALPHAOMEGA_SHADOW_ENABLED_CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return false;
  return data.config_value === true || data.config_value === 'true';
}

export async function observeAlphaOmegaShadowFire(
  supabase: SupabaseClient,
  payload: SignalInsertPayload,
  opts: { source: 'matched' | 'over_threshold' },
): Promise<ShadowFireObserveResult> {
  if (!isOmegaEnginePayload(payload)) return EMPTY_SHADOW_FIRE_RESULT;
  if (!shouldObserveAlphaOmegaFire()) return EMPTY_SHADOW_FIRE_RESULT;
  try {
    if (!(await isAlphaOmegaShadowEnabled(supabase))) return EMPTY_SHADOW_FIRE_RESULT;
    return await recordShadowObservedFire(supabase, payload, opts.source);
  } catch (err) {
    logWarn('[AlphaOmegaShadow] observe failed — live path unaffected', {
      signalId: readOmegaSignalId(payload),
      error: String(err),
    });
    return EMPTY_SHADOW_FIRE_RESULT;
  }
}

async function recordShadowObservedFire(
  supabase: SupabaseClient,
  payload: SignalInsertPayload,
  source: 'matched' | 'over_threshold',
): Promise<ShadowFireObserveResult> {
  const direction = readOmegaFireDirection(payload);
  const signalId = readOmegaSignalId(payload);
  if (!direction || !signalId) return EMPTY_SHADOW_FIRE_RESULT;

  const firedAt = readOmegaFireTimestamp(payload);
  const fire = { direction, firedAt, signalId };
  const markPrice = readPayloadMidPrice(payload);
  const crackEvent = await recordShadowFireAndDetectCrack(supabase, fire);
  await trackShadowFireAgainstOpenPositions(supabase, fire, crackEvent, markPrice);
  const paperEntered = await maybeEnterShadowPaperOnCrack(
    supabase,
    payload,
    crackEvent,
    source,
  );
  return { observed: true, crackEvent, paperEntered };
}

function readPayloadMidPrice(payload: SignalInsertPayload): number | null {
  const low = payload.entry_zone_low != null ? Number(payload.entry_zone_low) : null;
  const high = payload.entry_zone_high != null ? Number(payload.entry_zone_high) : null;
  if (low != null && high != null && Number.isFinite(low) && Number.isFinite(high)) {
    return (low + high) / 2;
  }
  if (low != null && Number.isFinite(low)) return low;
  return null;
}
