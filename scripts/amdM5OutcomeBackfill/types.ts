import type {
  AmdTag,
  DailyBiasAlignment,
  JudasDirection,
  Layer4D1Bias,
} from '../../src/services/amdDetector/amdTypes.js';

export type AmdM5OutcomeBackfillRow = {
  id: string;
  trade_date: string;
  amd_tag: string;
  judas_direction: JudasDirection | null;
  judas_pips: number | null;
  layer4_d1_bias: Layer4D1Bias;
  layer4_bullish_count: number | null;
  layer4_bearish_count: number | null;
  layer4_bullish_count_7: number | null;
  layer4_bearish_count_7: number | null;
  daily_bias_alignment: DailyBiasAlignment;
  reversal_confirmed: boolean | null;
  m5_vs_judas_direction: string | null;
  amd_outcome_tag: string | null;
  auto_direction: string | null;
  window_direction_confirmed: boolean | null;
};

export type BackfillMode = {
  runM5: boolean;
  runOutcome: boolean;
  runWindow: boolean;
  forceOutcome: boolean;
};

export type ParsedCliArgs = {
  tradeDates: string[];
  mode: BackfillMode;
  allowToday: boolean;
};

export function castAmdTag(rawTag: string): AmdTag {
  return rawTag as AmdTag;
}
