import type { SupabaseClient } from '@supabase/supabase-js';
import {
  LANE_B_CONFIG_PHASE2_ENFORCE,
  LANE_B_CONFIG_PHASE2_SHADOW,
  LANE_B_CONFIG_R1_ENFORCE,
} from './omegaLaneBConstants.js';

export interface LaneBConfigFlags {
  r1Enforce: boolean;
  phase2Shadow: boolean;
  phase2Enforce: boolean;
}

function parseBool(raw: unknown): boolean {
  return raw === true || raw === 'true';
}

async function readConfigBool(
  supabase: SupabaseClient,
  configKey: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', configKey)
    .maybeSingle();
  if (error || !data) return false;
  return parseBool(data.config_value);
}

export async function loadLaneBConfigFlags(
  supabase: SupabaseClient,
): Promise<LaneBConfigFlags> {
  const [r1Enforce, phase2Shadow, phase2Enforce] = await Promise.all([
    readConfigBool(supabase, LANE_B_CONFIG_R1_ENFORCE),
    readConfigBool(supabase, LANE_B_CONFIG_PHASE2_SHADOW),
    readConfigBool(supabase, LANE_B_CONFIG_PHASE2_ENFORCE),
  ]);
  return {
    r1Enforce,
    phase2Shadow: phase2Shadow || !phase2Enforce,
    phase2Enforce,
  };
}
