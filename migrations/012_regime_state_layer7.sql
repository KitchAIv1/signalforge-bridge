ALTER TABLE regime_state
  ADD COLUMN IF NOT EXISTS layer5_result_raw      text,
  ADD COLUMN IF NOT EXISTS layer7_pip_diff        integer,
  ADD COLUMN IF NOT EXISTS layer7_override_active boolean DEFAULT false;
