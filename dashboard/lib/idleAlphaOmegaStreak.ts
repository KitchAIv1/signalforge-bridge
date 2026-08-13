import type { SupabaseClient } from '@supabase/supabase-js';

/** Idle the live streak singleton so enable cannot crack from frozen state. */
export async function idleAlphaOmegaStreakRow(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { error } = await supabase
    .from('alpha_omega_streak_state')
    .update({
      current_streak_direction: null,
      current_streak_length: 0,
      current_streak_start_at: null,
      last_fire_at: null,
      armed: false,
      armed_direction: null,
      last_processed_signal_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);
  return error?.message ?? null;
}
