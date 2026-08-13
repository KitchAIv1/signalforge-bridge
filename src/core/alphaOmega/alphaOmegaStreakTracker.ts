/**
 * ALPHAOMEGA live streak tracker — incremental state machine mirroring the
 * validated backtest algorithm (scripts/omegaEntryTaxonomyRefinement.ts
 * `findEntriesWithMeta`), plus unarmed age-out hygiene (>45m reset).
 *
 * Persisted as alpha_omega_streak_state id=1. Lane A untouched.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ENTRY_SPEED_CEILING_MIN,
  ENTRY_STREAK_LENGTH,
  MAX_INTRA_RUN_GAP_MINUTES,
} from './alphaOmegaConstants.js';
import {
  isAlphaOmegaUnarmedAgeOutEnabled,
  minutesBetweenIso,
  shouldResetUnarmedStreakForAge,
} from './alphaOmegaUnarmedAgeOut.js';

export type AlphaOmegaDirection = 'LONG' | 'SHORT';

export interface StreakFireInput {
  direction: AlphaOmegaDirection;
  firedAt: string; // ISO
  signalId: string;
}

export interface StreakState {
  currentStreakDirection: AlphaOmegaDirection | null;
  currentStreakLength: number;
  currentStreakStartAt: string | null;
  lastFireAt: string | null;
  armed: boolean;
  armedDirection: AlphaOmegaDirection | null;
  lastProcessedSignalId: string | null;
}

export interface CrackEvent {
  brokenDirection: AlphaOmegaDirection;
  enterDirection: AlphaOmegaDirection;
  foundingLength: number;
  foundingSpeedMin: number;
}

export interface ProcessFireOptions {
  /** Default true. Live/shadow paths may pass false via kill switch. */
  unarmedAgeOutEnabled?: boolean;
}

export function emptyStreakState(): StreakState {
  return {
    currentStreakDirection: null,
    currentStreakLength: 0,
    currentStreakStartAt: null,
    lastFireAt: null,
    armed: false,
    armedDirection: null,
    lastProcessedSignalId: null,
  };
}

function detectCrack(
  state: StreakState,
  fire: StreakFireInput,
  preLength: number,
  preStartAt: string | null,
): CrackEvent | null {
  if (
    !state.armed ||
    !state.armedDirection ||
    fire.direction === state.armedDirection ||
    !preStartAt ||
    !state.lastFireAt
  ) {
    return null;
  }
  return {
    brokenDirection: state.armedDirection,
    enterDirection: fire.direction,
    foundingLength: preLength,
    foundingSpeedMin: minutesBetweenIso(preStartAt, state.lastFireAt),
  };
}

function continuesSameDirection(
  state: StreakState,
  fire: StreakFireInput,
  unarmedAgeOutEnabled: boolean,
): boolean {
  if (
    shouldResetUnarmedStreakForAge({
      armed: state.armed,
      streakStartAt: state.currentStreakStartAt,
      fireAt: fire.firedAt,
      enabled: unarmedAgeOutEnabled,
    })
  ) {
    return false;
  }
  const gapMinutes = state.lastFireAt
    ? minutesBetweenIso(state.lastFireAt, fire.firedAt)
    : 0;
  return (
    fire.direction === state.currentStreakDirection &&
    gapMinutes <= MAX_INTRA_RUN_GAP_MINUTES
  );
}

function tryArmStreak(
  nextArmed: boolean,
  nextLength: number,
  nextStartAt: string,
  nextDirection: AlphaOmegaDirection,
  fireAt: string,
): { armed: boolean; armedDirection: AlphaOmegaDirection | null } {
  if (nextArmed || nextLength < ENTRY_STREAK_LENGTH) {
    return { armed: nextArmed, armedDirection: nextArmed ? nextDirection : null };
  }
  const durationMin = minutesBetweenIso(nextStartAt, fireAt);
  if (durationMin >= 0 && durationMin <= ENTRY_SPEED_CEILING_MIN) {
    return { armed: true, armedDirection: nextDirection };
  }
  return { armed: false, armedDirection: null };
}

/**
 * Pure function — one fire against current state.
 * Crack check runs before continue/reset. Unarmed age-out only affects continue.
 */
export function processFireForStreak(
  state: StreakState,
  fire: StreakFireInput,
  options?: ProcessFireOptions,
): { nextState: StreakState; crack: CrackEvent | null } {
  const unarmedAgeOutEnabled = options?.unarmedAgeOutEnabled !== false;
  const preLength = state.currentStreakLength;
  const preStartAt = state.currentStreakStartAt;
  const crack = detectCrack(state, fire, preLength, preStartAt);

  const continuesStreak = continuesSameDirection(state, fire, unarmedAgeOutEnabled);
  const nextDirection: AlphaOmegaDirection = continuesStreak
    ? (state.currentStreakDirection as AlphaOmegaDirection)
    : fire.direction;
  const nextLength = continuesStreak ? preLength + 1 : 1;
  const nextStartAt = continuesStreak ? preStartAt! : fire.firedAt;

  let nextArmed = crack ? false : state.armed;
  let nextArmedDirection = crack ? null : state.armedDirection;
  if (!nextArmed) {
    const armedResult = tryArmStreak(
      false,
      nextLength,
      nextStartAt,
      nextDirection,
      fire.firedAt,
    );
    nextArmed = armedResult.armed;
    nextArmedDirection = armedResult.armedDirection;
  }

  return {
    nextState: {
      currentStreakDirection: nextDirection,
      currentStreakLength: nextLength,
      currentStreakStartAt: nextStartAt,
      lastFireAt: fire.firedAt,
      armed: nextArmed,
      armedDirection: nextArmedDirection,
      lastProcessedSignalId: fire.signalId,
    },
    crack,
  };
}

export async function loadStreakState(supabase: SupabaseClient): Promise<StreakState> {
  const { data, error } = await supabase
    .from('alpha_omega_streak_state')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return emptyStreakState();
  return {
    currentStreakDirection: (data.current_streak_direction as AlphaOmegaDirection | null) ?? null,
    currentStreakLength: Number(data.current_streak_length ?? 0),
    currentStreakStartAt: (data.current_streak_start_at as string | null) ?? null,
    lastFireAt: (data.last_fire_at as string | null) ?? null,
    armed: Boolean(data.armed),
    armedDirection: (data.armed_direction as AlphaOmegaDirection | null) ?? null,
    lastProcessedSignalId: (data.last_processed_signal_id as string | null) ?? null,
  };
}

export async function saveStreakState(
  supabase: SupabaseClient,
  state: StreakState,
): Promise<void> {
  const { error } = await supabase
    .from('alpha_omega_streak_state')
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
    console.warn('[AlphaOmega] saveStreakState failed', error.message);
  }
}

function isIdleStreakState(state: StreakState): boolean {
  return (
    state.currentStreakLength === 0 &&
    !state.armed &&
    state.currentStreakDirection == null &&
    state.lastProcessedSignalId == null
  );
}

/** Drop frozen armed/partial streak so a later AO enable cannot crack from it. */
export async function idlePersistedStreakState(
  supabase: SupabaseClient,
): Promise<void> {
  const state = await loadStreakState(supabase);
  if (isIdleStreakState(state)) return;
  await saveStreakState(supabase, emptyStreakState());
}

/**
 * Load → process one fire → persist. Idempotent on duplicate signal_id.
 * Kill switch read here so pure tests stay side-effect free.
 */
export async function recordFireAndDetectCrack(
  supabase: SupabaseClient,
  fire: StreakFireInput,
): Promise<CrackEvent | null> {
  const state = await loadStreakState(supabase);
  if (state.lastProcessedSignalId === fire.signalId) {
    return null;
  }
  const unarmedAgeOutEnabled = await isAlphaOmegaUnarmedAgeOutEnabled(supabase);
  const { nextState, crack } = processFireForStreak(state, fire, {
    unarmedAgeOutEnabled,
  });
  await saveStreakState(supabase, nextState);
  return crack;
}
