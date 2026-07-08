/**
 * ENGINE_AMD exit constants — isolated from Omega trail (R-based) and other engines.
 * Override via AMD_PIP_TRAIL_PIPS env for rollback without code deploy.
 */

const DEFAULT_TRAIL_PIPS = 5;

function parseEnvTrailPips(): number | null {
  const raw = process.env.AMD_PIP_TRAIL_PIPS?.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/** S0/S1 pip trail distance from peak favorable price (15 pip hard SL unchanged). */
export const AMD_PIP_TRAIL_PIPS = parseEnvTrailPips() ?? DEFAULT_TRAIL_PIPS;

export const AMD_HARD_SL_PIPS = 15;
