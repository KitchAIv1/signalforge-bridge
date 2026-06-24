-- 050_omega_shadow_trail_exit_opt.sql
-- Add optimized SL lane (SHORT 2.0R / LONG 3.0R) alongside baseline 1.5R shadow columns.

ALTER TABLE omega_shadow_trail_exit
  ADD COLUMN IF NOT EXISTS shadow_opt_sl_r numeric,
  ADD COLUMN IF NOT EXISTS shadow_opt_exit_type text,
  ADD COLUMN IF NOT EXISTS shadow_opt_pips_gross numeric,
  ADD COLUMN IF NOT EXISTS shadow_opt_pips_net numeric,
  ADD COLUMN IF NOT EXISTS shadow_opt_exit_bars integer,
  ADD COLUMN IF NOT EXISTS shadow_opt_win boolean,
  ADD COLUMN IF NOT EXISTS sequenced_opt_status text,
  ADD COLUMN IF NOT EXISTS sequenced_opt_pips_net numeric;

COMMENT ON COLUMN omega_shadow_trail_exit.shadow_opt_sl_r IS
  'Direction-specific SL multiplier: SHORT 2.0R, LONG 3.0R (trail 0.5R unchanged).';
COMMENT ON COLUMN omega_shadow_trail_exit.shadow_opt_pips_net IS
  'Ungated shadow net pips at optimized SL — parallel to shadow_pips_net (baseline 1.5R).';
COMMENT ON COLUMN omega_shadow_trail_exit.sequenced_opt_pips_net IS
  'Sequenced gate net pips using optimized exit bars — parallel to sequenced_pips_net.';
