import type { AmdDolJoinedRow, ProductionDirection } from './types.js';

export function predictedJudasInversionRaw(
  judasDirection: string | null
): ProductionDirection {
  if (judasDirection === 'DOWN') return 'long';
  if (judasDirection === 'UP') return 'short';
  return 'neutral';
}

export function predictedAutoDirection(
  autoDirection: string | null
): ProductionDirection {
  if (autoDirection === 'long' || autoDirection === 'short') return autoDirection;
  return 'neutral';
}

export function predictedProduction(row: AmdDolJoinedRow): ProductionDirection {
  const tag = row.amd_tag ?? '';
  if (tag === 'INSUFFICIENT_DATA') return 'neutral';
  if (tag === 'AMD_TEXTBOOK') return textbookPredict(row.judas_direction);
  if (tag === 'AMD_COMPRESSION_BREAKOUT') return compressionPredict(row.judas_direction);
  if (tag === 'AMD_FAILED') return failedPredict(row);
  if (tag === 'AMD_SHIFTED') return shiftedPredict(row.layer4_d1_bias_7);
  if (tag === 'AMD_NONE') return nonePredict(row);
  return 'neutral';
}

function textbookPredict(judasDirection: string | null): ProductionDirection {
  if (judasDirection === 'DOWN') return 'long';
  if (judasDirection === 'UP') return 'short';
  return 'neutral';
}

function compressionPredict(judasDirection: string | null): ProductionDirection {
  if (judasDirection === 'DOWN') return 'short';
  if (judasDirection === 'UP') return 'long';
  return 'neutral';
}

function failedPredict(row: AmdDolJoinedRow): ProductionDirection {
  const d1Bias = row.layer4_d1_bias;
  if (d1Bias === 'TRENDING_UP' || d1Bias === 'TRENDING_DOWN') {
    return d1Bias === 'TRENDING_UP' ? 'long' : 'short';
  }
  if (d1Bias !== 'RANGING') return 'neutral';
  if (row.m5_vs_judas_direction !== 'WITH_JUDAS') return 'neutral';
  if ((row.judas_pips ?? 0) < 8) return 'neutral';
  return followJudas(row.judas_direction);
}

function shiftedPredict(layer4D1Bias7: string | null): ProductionDirection {
  if (layer4D1Bias7 === 'TRENDING_UP') return 'long';
  if (layer4D1Bias7 === 'TRENDING_DOWN') return 'short';
  return 'neutral';
}

function nonePredict(row: AmdDolJoinedRow): ProductionDirection {
  const bull = row.layer4_bullish_count ?? 0;
  const bear = row.layer4_bearish_count ?? 0;
  if (bull >= 4) return 'long';
  if (bear >= 4) return 'short';
  if (bull === 3 || bear === 3) return invertJudas(row.judas_direction);
  if (row.layer4_d1_bias === 'RANGING') return 'neutral';
  return 'neutral';
}

function followJudas(judasDirection: string | null): ProductionDirection {
  if (judasDirection === 'DOWN') return 'short';
  if (judasDirection === 'UP') return 'long';
  return 'neutral';
}

function invertJudas(judasDirection: string | null): ProductionDirection {
  if (judasDirection === 'DOWN') return 'long';
  if (judasDirection === 'UP') return 'short';
  return 'neutral';
}
