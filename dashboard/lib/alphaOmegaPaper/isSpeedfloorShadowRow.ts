import {
  ALPHAOMEGA_ADVISORY_SPEEDFLOOR_PREFIX,
  ALPHAOMEGA_BLOCK_SPEED_FLOOR,
  isAlphaOmegaSpeedFloorAdvisory,
} from '@/lib/alphaOmegaAdvisoryParse';
import type { BridgeTradeLogRow } from '@/lib/types';

export function isSpeedfloorShadowRow(row: BridgeTradeLogRow): boolean {
  if (row.decision !== 'BLOCKED') return false;
  if (row.block_reason === ALPHAOMEGA_BLOCK_SPEED_FLOOR) return true;
  return isAlphaOmegaSpeedFloorAdvisory(row.lane_advisory);
}

export function speedfloorShadowPrefix(): string {
  return ALPHAOMEGA_ADVISORY_SPEEDFLOOR_PREFIX;
}
