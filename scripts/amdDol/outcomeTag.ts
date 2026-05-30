import type { AmdDolJoinedRow, ProductionDirection } from './types.js';
import { predictedJudasInversionRaw } from './productionPredict.js';

export function outcomeDirectionFromTag(row: AmdDolJoinedRow): ProductionDirection | null {
  const outcomeTag = row.amd_outcome_tag;
  if (!outcomeTag) return null;
  if (outcomeTag === 'AMD_TEXTBOOK') {
    return predictedJudasInversionRaw(row.judas_direction);
  }
  if (outcomeTag === 'AMD_COMPRESSION_BREAKOUT') {
    return followJudas(row.judas_direction);
  }
  if (outcomeTag === 'AMD_FAILED') return null;
  if (outcomeTag === 'AMD_SHIFTED') return d1Bias7Direction(row.layer4_d1_bias_7);
  if (outcomeTag === 'AMD_NONE') return d1Bias5Direction(row.layer4_d1_bias);
  return null;
}

function followJudas(judasDirection: string | null): ProductionDirection | null {
  if (judasDirection === 'DOWN') return 'short';
  if (judasDirection === 'UP') return 'long';
  return null;
}

function d1Bias7Direction(bias: string | null): ProductionDirection | null {
  if (bias === 'TRENDING_UP') return 'long';
  if (bias === 'TRENDING_DOWN') return 'short';
  if (bias === 'RANGING') return 'neutral';
  return null;
}

function d1Bias5Direction(bias: string | null): ProductionDirection | null {
  if (bias === 'TRENDING_UP') return 'long';
  if (bias === 'TRENDING_DOWN') return 'short';
  if (bias === 'RANGING') return 'neutral';
  return null;
}
