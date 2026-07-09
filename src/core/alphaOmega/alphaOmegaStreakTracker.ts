/**
 * ALPHAOMEGA live streak tracker — incremental state machine mirroring the
 * validated backtest algorithm exactly (scripts/omegaEntryTaxonomyRefinement.ts
 * `findEntriesWithMeta`): a "founding streak" of ENTRY_STREAK_LENGTH
 * same-direction fires forming within ENTRY_SPEED_CEILING_MIN minutes arms;
 * the next opposite-direction fire is a "crack" — simultaneously a fresh
 * entry opportunity (if flat) and a backstop-exit trigger (if the cracked
 * direction matches an open position).
 *
 * Persisted as a single row (alpha_omega_streak_state) so state survives
 * process restarts. Lane A is untouched — this only observes the shared
 * omega fire stream and is consumed exclusively by Lane B code paths.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ENTRY_SPEED_CEILING_MIN,
  ENTRY_STREAK_LENGTH,
  MAX_INTRA_RUN_GAP_MINUTES,
} from './alphaOmegaConstants.js';

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
  /** The founding streak's direction — the one that just broke. */
  brokenDirection: AlphaOmegaDirection;
  /** The new fire's direction — what a fresh entry (or backstop exit) would act on. */
  enterDirection: AlphaOmegaDirection;
  /** Exact founding streak length (>= ENTRY_STREAK_LENGTH; can be longer if it kept growing post-arm). */
  foundingLength: number;
  /** Minutes from founding streak start to its last fire before cracking. */
  foundingSpeedMin: number;
}

function minutesBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / 60_000;
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

/**
 * Pure function — processes exactly one fire against the current state.
 * Mirrors the validated backtest's `findEntriesWithMeta` loop body exactly,
 * adapted from batch (full array + index) to incremental (one fire at a time).
 */
export function processFireForStreak(
  state: StreakState,
  fire: StreakFireInput,
): { nextState: StreakState; crack: CrackEvent | null } {
  const preLength = state.currentStreakLength;
  const preStartAt = state.currentStreakStartAt;
  const preDirection = state.currentStreakDirection;

  let crack: CrackEvent | null = null;
  if (state.armed && state.armedDirection && fire.direction !== state.armedDirection && preStartAt && state.lastFireAt) {
    crack = {
      brokenDirection: state.armedDirection,
      enterDirection: fire.direction,
      foundingLength: preLength,
      foundingSpeedMin: minutesBetween(preStartAt, state.lastFireAt),
    };
  }

  const gapMinutes = state.lastFireAt ? minutesBetween(state.lastFireAt, fire.firedAt) : 0;
  const continuesStreak = fire.direction === preDirection && gapMinutes <= MAX_INTRA_RUN_GAP_MINUTES;

  const nextDirection: AlphaOmegaDirection = continuesStreak ? (preDirection as AlphaOmegaDirection) : fire.direction;
  const nextLength = continuesStreak ? preLength + 1 : 1;
  const nextStartAt = continuesStreak ? preStartAt! : fire.firedAt;

  let nextArmed = crack ? false : state.armed;
  let nextArmedDirection = crack ? null : state.armedDirection;

  if (!nextArmed && nextLength >= ENTRY_STREAK_LENGTH) {
    const durationMin = minutesBetween(nextStartAt, fire.firedAt);
    if (durationMin >= 0 && durationMin <= ENTRY_SPEED_CEILING_MIN) {
      nextArmed = true;
      nextArmedDirection = nextDirection;
    }
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

export async function saveStreakState(supabase: SupabaseClient, state: StreakState): Promise<void> {
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

/**
 * Loads state, processes this one fire, persists the updated state, returns
 * the crack event (if any). Idempotency guard: if this exact signal was
 * already the last one processed (e.g. a retry / duplicate fan-out call for
 * the same incoming signal across multiple broker routes), skip re-processing
 * so the streak isn't double-counted.
 */
export async function recordFireAndDetectCrack(
  supabase: SupabaseClient,
  fire: StreakFireInput,
): Promise<CrackEvent | null> {
  const state = await loadStreakState(supabase);
  if (state.lastProcessedSignalId === fire.signalId) {
    return null; // already processed this exact signal (duplicate fan-out call)
  }
  const { nextState, crack } = processFireForStreak(state, fire);
  await saveStreakState(supabase, nextState);
  return crack;
}
