/**
 * Insert a test signal into the signals table to trigger the bridge via Realtime.
 * Run after bridge is up; ensure SIGNAL_TABLE=signals and bridge subscribes to same Supabase.
 */

import 'dotenv/config';
import { getSupabaseClient } from '../connectors/supabase.js';

async function main(): Promise<void> {
  const supabase = getSupabaseClient();
  const table = process.env.SIGNAL_TABLE ?? 'signals';
  const { error } = await supabase.from(table).insert({
    pair: 'EURUSD',
    direction: 'long',
    engine_id: 'charlie',
    confluence_score: 59,
    entry_zone_low: 1.0845,
    entry_zone_high: 1.0855,
    stop_loss: 1.082,
    target_1: 1.091,
    target_2: 1.095,
    stop_loss_pips: 25,
    target_1_pips: 65,
    target_2_pips: 100,
    risk_reward_1: 1.5,
    risk_reward_2: 2,
    execution_tier: 'reduced',
    timeframe_primary: 'H4',
    provider_id: 'signalforge_v1',
    regime: 'trending',
    created_at: new Date().toISOString(),
  });
  if (error) {
    console.error('Insert failed:', error);
    process.exit(1);
  }
  console.log(`Test signal inserted into ${table}. Bridge should process via Realtime.`);
}

main();
