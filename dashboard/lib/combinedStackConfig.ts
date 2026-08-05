/**
 * Combined Stack config keys — must mirror bridge-side constants:
 * - alpha_omega_amd_day_gate_enabled (src/core/alphaOmega/alphaOmegaConstants.ts)
 * - amd_dead_trade_abort_enabled / amd_trail_split_enabled (072 exit stack)
 * The master switch writes exactly these three; amd_hard_sl_pips is
 * deliberately excluded (SQL-only until abort+trail prove out live).
 */

export const ALPHAOMEGA_AMD_DAY_GATE_CONFIG_KEY = 'alpha_omega_amd_day_gate_enabled';
export const AMD_DEAD_TRADE_ABORT_CONFIG_KEY = 'amd_dead_trade_abort_enabled';
export const AMD_TRAIL_SPLIT_CONFIG_KEY = 'amd_trail_split_enabled';

export const COMBINED_STACK_CONFIG_KEYS = [
  ALPHAOMEGA_AMD_DAY_GATE_CONFIG_KEY,
  AMD_DEAD_TRADE_ABORT_CONFIG_KEY,
  AMD_TRAIL_SPLIT_CONFIG_KEY,
] as const;

export type CombinedStackState = 'on' | 'off' | 'mixed';

export function parseBridgeConfigBool(raw: unknown): boolean {
  return raw === true || raw === 'true';
}

export function resolveCombinedStackState(
  flagValues: readonly boolean[],
): CombinedStackState {
  if (flagValues.every((value) => value)) return 'on';
  if (flagValues.every((value) => !value)) return 'off';
  return 'mixed';
}
