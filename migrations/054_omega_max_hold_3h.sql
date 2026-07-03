-- Migration 054: OMEGA best setup — reduce max hold from 6h (360m) to 3h (180m).
-- Replay-validated Jun 26+ RAW sequenced: +64p vs +4p at 360m baseline.
-- Applies to both oanda_practice and vtmarkets_omega_demo (engine-level cap).
-- Rollback: UPDATE bridge_engines SET max_hold_hours = 6 WHERE engine_id = 'omega';

UPDATE bridge_engines
SET max_hold_hours = 3, updated_at = NOW()
WHERE engine_id = 'omega';
