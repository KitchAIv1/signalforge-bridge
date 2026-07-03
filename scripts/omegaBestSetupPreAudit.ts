/**
 * Pre/post change audit for OMEGA best setup (180m max hold).
 * Run: npx tsx scripts/omegaBestSetupPreAudit.ts [label=pre|post]
 */

import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(SCRIPT_DIR, 'output');

async function main(): Promise<void> {
  const label = process.argv[2] ?? 'pre';
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY required');

  const supabase = createClient(url, key);
  const lines: string[] = [
    `OMEGA BEST SETUP AUDIT (${label.toUpperCase()})`,
    `Generated: ${new Date().toISOString()}`,
    '',
  ];

  const { data: engineRow, error: engineErr } = await supabase
    .from('bridge_engines')
    .select('engine_id, max_hold_hours, is_active')
    .eq('engine_id', 'omega')
    .single();
  lines.push('=== bridge_engines (omega) ===');
  lines.push(engineErr ? `ERROR: ${engineErr.message}` : JSON.stringify(engineRow, null, 2));

  const { data: links, error: linksErr } = await supabase
    .from('bridge_links')
    .select('engine_id, broker_id, is_active, capital_allocation_pct')
    .eq('engine_id', 'omega');
  lines.push('', '=== bridge_links (omega) ===');
  lines.push(linksErr ? `ERROR: ${linksErr.message}` : JSON.stringify(links, null, 2));

  const { data: rawMode, error: rawErr } = await supabase
    .from('bridge_config')
    .select('config_key, config_value')
    .eq('config_key', 'omega_raw_mode')
    .maybeSingle();
  lines.push('', '=== bridge_config omega_raw_mode ===');
  lines.push(rawErr ? `ERROR: ${rawErr.message}` : JSON.stringify(rawMode, null, 2));

  const { data: maxHoldCloses, error: closesErr } = await supabase
    .from('bridge_trade_log')
    .select('broker_id, signal_received_at, duration_minutes, pnl_pips, close_reason, created_at')
    .eq('engine_id', 'omega')
    .eq('close_reason', 'max_hold')
    .order('created_at', { ascending: false })
    .limit(20);
  lines.push('', '=== recent max_hold closes (last 20) ===');
  lines.push(closesErr ? `ERROR: ${closesErr.message}` : JSON.stringify(maxHoldCloses, null, 2));

  const { data: openTrades, error: openErr } = await supabase
    .from('bridge_trade_log')
    .select('id, broker_id, direction, signal_received_at, status')
    .eq('engine_id', 'omega')
    .eq('status', 'open');
  lines.push('', '=== open omega trades at audit time ===');
  lines.push(openErr ? `ERROR: ${openErr.message}` : JSON.stringify(openTrades, null, 2));

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `omega_best_setup_audit_${label}.txt`);
  writeFileSync(outPath, lines.join('\n'));
  console.log(lines.join('\n'));
  console.log(`\nSaved: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
