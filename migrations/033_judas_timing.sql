ALTER TABLE amd_state
  ADD COLUMN IF NOT EXISTS judas_extreme_utc_hour integer,
  ADD COLUMN IF NOT EXISTS judas_timing text;

COMMENT ON COLUMN amd_state.judas_extreme_utc_hour IS
  'UTC hour (8 or 9) when Judas extreme price was hit. Derived from chart_data.ohlc. NULL if FLAT Judas or chart_data missing.';

COMMENT ON COLUMN amd_state.judas_timing IS
  'EARLY (hour=8) or LATE (hour=9). Research signal: LATE confirmation rate 75% vs EARLY 52%. Advisory only — no execution impact.';
