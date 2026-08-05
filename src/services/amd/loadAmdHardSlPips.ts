/**
 * Config-driven hard SL distance (pips) for NEW engine_amd trades.
 * Read at order placement: sets the broker-side SL and the sizing
 * denominator (units = risk / SL), so lowering it proportionally
 * increases units per dollar of risk. Existing open trades are
 * unaffected — the monitor derives each trade's R from its own stored
 * hard_sl_price. Invalid / missing / out-of-range values fall back to
 * the legacy constant (15).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AMD_HARD_SL_PIPS,
  AMD_HARD_SL_PIPS_CONFIG_KEY,
} from './amdTrailConstants.js';

const MIN_VALID_SL_PIPS = 3;
const MAX_VALID_SL_PIPS = 50;
const CACHE_TTL_MS = 60_000;

let cachedSlPips: number | null = null;
let cacheExpiresAt = 0;

function parseValidSlPips(raw: unknown): number | null {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < MIN_VALID_SL_PIPS || parsed > MAX_VALID_SL_PIPS) return null;
  return parsed;
}

export async function loadAmdHardSlPips(supabase: SupabaseClient): Promise<number> {
  const now = Date.now();
  if (cachedSlPips !== null && now < cacheExpiresAt) return cachedSlPips;

  let resolved = AMD_HARD_SL_PIPS;
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', AMD_HARD_SL_PIPS_CONFIG_KEY)
    .maybeSingle();
  if (!error && data) {
    const parsed = parseValidSlPips(data.config_value);
    if (parsed !== null) resolved = parsed;
  }

  cachedSlPips = resolved;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return resolved;
}

/** Test hook: clear the 60s cache. */
export function resetAmdHardSlPipsCache(): void {
  cachedSlPips = null;
  cacheExpiresAt = 0;
}
