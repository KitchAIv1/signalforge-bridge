/**
 * Shadow AO streak persistence — isolated table; never touches live id=1.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isAlphaOmegaUnarmedAgeOutEnabled } from './alphaOmegaUnarmedAgeOut.js';
import {
  emptyStreakState,
  processFireForStreak,
  type CrackEvent,
  type StreakFireInput,
  type StreakState,
} from './alphaOmegaStreakTracker.js';

const SHADOW_STREAK_TABLE = 'alpha_omega_shadow_streak_state';

export async function loadShadowStreakState(
  supabase: SupabaseClient,
): Promise<StreakState> {
  const { data, error } = await supabase
    .from(SHADOW_STREAK_TABLE)
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return emptyStreakState();
  return {
    currentStreakDirection: (data.current_streak_direction as StreakState['currentStreakDirection']) ?? null,
    currentStreakLength: Number(data.current_streak_length ?? 0),
    currentStreakStartAt: (data.current_streak_start_at as string | null) ?? null,
    lastFireAt: (data.last_fire_at as string | null) ?? null,
    armed: Boolean(data.armed),
    armedDirection: (data.armed_direction as StreakState['armedDirection']) ?? null,
    lastProcessedSignalId: (data.last_processed_signal_id as string | null) ?? null,
  };
}

export async function saveShadowStreakState(
  supabase: SupabaseClient,
  state: StreakState,
): Promise<void> {
  const { error } = await supabase
    .from(SHADOW_STREAK_TABLE)
    .update({
      current_streak_direction: state.currentStreakDirection,
      current_streak_length: state.currentStreakLength,
      current_streak_start_at: state.currentStreakStartAt,
      last_fire_at: state.lastFireAt,
      armed: state.armed,
      armed_direction: state.armedDirection,
      last_processed_signal_id: state.lastProcessedSignalId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);
  if (error) {
    console.warn('[AlphaOmegaShadow] saveShadowStreakState failed', error.message);
  }
}

export async function recordShadowFireAndDetectCrack(
  supabase: SupabaseClient,
  fire: StreakFireInput,
): Promise<CrackEvent | null> {
  const state = await loadShadowStreakState(supabase);
  if (state.lastProcessedSignalId === fire.signalId) return null;
  const unarmedAgeOutEnabled = await isAlphaOmegaUnarmedAgeOutEnabled(supabase);
  const { nextState, crack } = processFireForStreak(state, fire, {
    unarmedAgeOutEnabled,
  });
  await saveShadowStreakState(supabase, nextState);
  return crack;
}
