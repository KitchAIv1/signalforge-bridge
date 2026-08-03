-- Mirror of SIGNALFORGE migration 20260803154500_signals_ao_execution_tiers.sql
-- Widens signals.execution_tier CHECK so engine-omega exec-dedup can emit
-- ao_observe (and ao_shadow_over) for AO streak observe without Trail.

ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_execution_tier_check;

ALTER TABLE signals ADD CONSTRAINT signals_execution_tier_check
  CHECK (
    execution_tier IN (
      'full',
      'reduced',
      'no_trade',
      'ao_observe',
      'ao_shadow_over'
    )
  );
