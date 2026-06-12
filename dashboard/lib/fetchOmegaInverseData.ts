import { getSupabase } from '@/lib/supabase';
import { OMEGA_INVERSE_SHADOW_PATTERN } from '@/lib/omegaInverseConstants';
import { computeOmegaInverseStats, parseOmegaDirectionValue } from '@/lib/omegaInverseHelpers';
import type { LiveExecution, OmegaInverseData, ShadowSignal } from '@/lib/omegaInverseTypes';

const LIVE_SELECT =
  'created_at, direction, status, block_reason, fill_price, exit_price, pnl_r, pnl_dollars, result, close_reason, signal_session, amd_tag, decision, entry_price';

function readConfigString(raw: unknown): string | null {
  return typeof raw === 'string' ? raw : null;
}

export async function fetchOmegaInverseData(): Promise<OmegaInverseData> {
  const supabase = getSupabase();
  const [liveRes, shadowRes, dirRes, untilRes] = await Promise.all([
    supabase
      .from('bridge_trade_log')
      .select(LIVE_SELECT)
      .eq('engine_id', 'omega_inverse')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('omega_shadow_signals')
      .select('fired_at, direction, entry_price, sl_price, session, regime, mfe_r, mae_r')
      .eq('pattern_id', OMEGA_INVERSE_SHADOW_PATTERN)
      .order('fired_at', { ascending: false })
      .limit(200),
    supabase
      .from('bridge_config')
      .select('config_value')
      .eq('config_key', 'omega_direction')
      .maybeSingle(),
    supabase
      .from('bridge_config')
      .select('config_value')
      .eq('config_key', 'omega_direction_valid_until')
      .maybeSingle(),
  ]);

  if (liveRes.error) throw new Error(liveRes.error.message);
  if (shadowRes.error) throw new Error(shadowRes.error.message);
  if (dirRes.error) throw new Error(dirRes.error.message);
  if (untilRes.error) throw new Error(untilRes.error.message);

  const liveExecutions = (liveRes.data ?? []) as LiveExecution[];
  const shadowSignals = (shadowRes.data ?? []) as ShadowSignal[];

  return {
    liveExecutions,
    shadowSignals,
    omegaDirection: parseOmegaDirectionValue(dirRes.data?.config_value),
    validUntil: readConfigString(untilRes.data?.config_value),
    stats: computeOmegaInverseStats(liveExecutions, shadowSignals),
  };
}
