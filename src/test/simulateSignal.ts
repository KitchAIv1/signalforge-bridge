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
    direction: 'LONG',
    engine_id: 'alpha',
    confluence_score: 78,
    entry_zone_low: 1.0845,
    entry_zone_high: 1.0855,
    stop_loss: 1.082,
    take_profit: 1.091,
    regime: 'trending',
  });
  if (error) {
    console.error('Insert failed:', error);
    process.exit(1);
  }
  console.log(`Test signal inserted into ${table}. Bridge should process via Realtime.`);
}

main();
