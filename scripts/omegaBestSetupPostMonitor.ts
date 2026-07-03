/**
 * Post-rollout monitoring for OMEGA 180m max hold (run daily for first week).
 *
 * Run: npx tsx scripts/omegaBestSetupPostMonitor.ts [since=2026-07-03]
 */

import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(SCRIPT_DIR, 'output');

interface TradeRow {
  broker_id: string | null;
  close_reason: string | null;
  duration_minutes: number | null;
  pnl_pips: number | null;
  decision: string | null;
  block_reason: string | null;
}

function sumPips(rows: TradeRow[]): number {
  return rows.reduce((sum, row) => sum + (row.pnl_pips ?? 0), 0);
}

function groupCount(rows: TradeRow[], key: keyof TradeRow): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const label = String(row[key] ?? 'unknown');
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}

async function main(): Promise<void> {
  const sinceArg = process.argv[2] ?? '2026-07-03';
  const sinceIso = sinceArg.includes('T') ? sinceArg : `${sinceArg}T00:00:00.000Z`;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY required');

  const supabase = createClient(url, key);

  const { data: engineRow } = await supabase
    .from('bridge_engines')
    .select('max_hold_hours')
    .eq('engine_id', 'omega')
    .single();

  const { data: closedRows } = await supabase
    .from('bridge_trade_log')
    .select('broker_id, close_reason, duration_minutes, pnl_pips, decision, block_reason')
    .eq('engine_id', 'omega')
    .eq('status', 'closed')
    .gte('created_at', sinceIso);

  const { data: decisionRows } = await supabase
    .from('bridge_trade_log')
    .select('decision, block_reason, broker_id')
    .eq('engine_id', 'omega')
    .gte('created_at', sinceIso);

  const closed = (closedRows ?? []) as TradeRow[];
  const decisions = (decisionRows ?? []) as TradeRow[];
  const maxHoldCloses = closed.filter((row) => row.close_reason === 'max_hold');
  const executed = decisions.filter((row) => row.decision === 'EXECUTED');
  const blocked = decisions.filter((row) =>
    String(row.block_reason ?? '').includes('OMEGA_TRADE_OPEN'),
  );

  const maxHoldDurations = maxHoldCloses
    .map((row) => row.duration_minutes)
    .filter((value): value is number => value != null);

  const avgMaxHoldDur =
    maxHoldDurations.length > 0
      ? maxHoldDurations.reduce((sum, value) => sum + value, 0) / maxHoldDurations.length
      : null;

  const lines: string[] = [
    'OMEGA BEST SETUP — POST-ROLLOUT MONITOR',
    `Generated: ${new Date().toISOString()}`,
    `Since: ${sinceIso.slice(0, 10)}`,
    '',
    '=== CONFIG ===',
    `omega max_hold_hours: ${engineRow?.max_hold_hours ?? 'unknown'} (expect 3)`,
    '',
    '=== EXECUTION ===',
    `Executed decisions: ${executed.length}`,
    `Sequence-blocked (OMEGA_TRADE_OPEN): ${blocked.length}`,
    '',
    '=== CLOSED TRADES ===',
    `Total closed: ${closed.length}`,
    `Net pips (closed with pnl): ${sumPips(closed).toFixed(1)}p`,
    'Close reason mix:',
    ...Object.entries(groupCount(closed, 'close_reason')).map(
      ([reason, count]) => `  ${reason}: ${count}`,
    ),
    '',
    '=== MAX_HOLD COHORT ===',
    `Count: ${maxHoldCloses.length}`,
    `Avg duration_minutes: ${avgMaxHoldDur != null ? avgMaxHoldDur.toFixed(1) : 'n/a'} (expect ~180)`,
    'By broker:',
    ...Object.entries(groupCount(maxHoldCloses, 'broker_id')).map(
      ([brokerId, count]) => `  ${brokerId}: ${count}`,
    ),
    `Max_hold net pips: ${sumPips(maxHoldCloses).toFixed(1)}p`,
    '',
    '=== PnL BY BROKER (all closes) ===',
  ];

  const brokerIds = [...new Set(closed.map((row) => row.broker_id ?? 'unknown'))];
  for (const brokerId of brokerIds.sort()) {
    const brokerRows = closed.filter((row) => (row.broker_id ?? 'unknown') === brokerId);
    lines.push(`  ${brokerId}: ${brokerRows.length} trades, ${sumPips(brokerRows).toFixed(1)}p`);
  }

  lines.push('', '=== RECENT MAX_HOLD CLOSES ===');
  const { data: recentMaxHold } = await supabase
    .from('bridge_trade_log')
    .select('broker_id, signal_received_at, duration_minutes, pnl_pips, created_at')
    .eq('engine_id', 'omega')
    .eq('close_reason', 'max_hold')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(10);

  for (const row of recentMaxHold ?? []) {
    const record = row as Record<string, unknown>;
    lines.push(
      `  ${String(record.created_at).slice(0, 16)} | ${record.broker_id} | ${record.duration_minutes}m | ${record.pnl_pips ?? 'n/a'}p`,
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = join(OUT_DIR, `omega_best_setup_monitor_${stamp}.txt`);
  writeFileSync(outPath, lines.join('\n'));
  console.log(lines.join('\n'));
  console.log(`\nSaved: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
