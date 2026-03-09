-- SignalForge Bridge — RLS for dashboard (anon key).
-- Run in Supabase SQL Editor after 000 (or 001a–001d). Enables dashboard to read all bridge_* and update only bridge_active / kill_switch.

-- Enable RLS on tables the dashboard uses (service_role bypasses RLS; anon uses these policies).
ALTER TABLE bridge_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_health_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_trade_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_engines ENABLE ROW LEVEL SECURITY;

-- Allow anon to SELECT (read-only) on all dashboard tables.
CREATE POLICY "dashboard_select_bridge_config" ON bridge_config FOR SELECT TO anon USING (true);
CREATE POLICY "dashboard_select_bridge_brokers" ON bridge_brokers FOR SELECT TO anon USING (true);
CREATE POLICY "dashboard_select_bridge_health_log" ON bridge_health_log FOR SELECT TO anon USING (true);
CREATE POLICY "dashboard_select_bridge_trade_log" ON bridge_trade_log FOR SELECT TO anon USING (true);
CREATE POLICY "dashboard_select_bridge_engines" ON bridge_engines FOR SELECT TO anon USING (true);

-- Allow anon to UPDATE only bridge_active and kill_switch in bridge_config.
CREATE POLICY "dashboard_update_bridge_config_switches"
  ON bridge_config FOR UPDATE TO anon
  USING (config_key IN ('bridge_active', 'kill_switch'))
  WITH CHECK (config_key IN ('bridge_active', 'kill_switch'));

-- Bridge process uses service_role key and is not affected by RLS.
