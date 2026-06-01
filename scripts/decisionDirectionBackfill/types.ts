import type { AmdAutoDirectionSnapshot, AmdTag } from '../../src/services/amdDetector/amdTypes.js';

export const AUD_USD_PAIR = 'AUD_USD';
export const BACKFILL_START_DATE = '2025-05-01';
export const RATE_LIMIT_MS = 700;
export const MAX_RETRIES = 3;
export const OUTPUT_CSV = 'scripts/output/decision_direction_backfill_v2.csv';

export type AmdStateBackfillRow = {
  trade_date: string;
  auto_direction: string | null;
  decision_auto_direction: string | null;
  amd_tag: string | null;
};

export type DayBackfillResult = {
  trade_date: string;
  status: 'computed' | 'skipped_existing' | 'error';
  amd_tag_computed: AmdTag | null;
  decision_direction: string | null;
  auto_direction_db: string | null;
  changed: boolean;
  flagged_tag: boolean;
  error_message: string | null;
  asian_is_flat: boolean | null;
  reversal_confirmed: boolean | null;
  d1_bars_raw: number | null;
  d1_bars_used: number | null;
  d1_last_dropped_time: string | null;
  layer4_bullish: number | null;
  layer4_bearish: number | null;
  layer4_d1_bias: string | null;
};

export type BackfillSummary = {
  total: number;
  computed: number;
  skipped_existing: number;
  same_as_db: number;
  changed_from_db: number;
  flagged_tag_count: number;
  errors: number;
  dry_run: boolean;
};

export type ReconstructedDecision = {
  amdTag: AmdTag;
  autoSnapshot: AmdAutoDirectionSnapshot;
  asianIsFlat: boolean;
  reversalConfirmed: boolean | null;
  d1BarsRaw: number;
  d1BarsUsed: number;
  d1LastDroppedTime: string | null;
  layer4Bullish: number | null;
  layer4Bearish: number | null;
  layer4D1Bias: string | null;
};
