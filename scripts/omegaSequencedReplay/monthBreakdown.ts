import { readFileSync } from 'node:fs';

const lines = readFileSync('scripts/output/omega_raw_sequenced_replay_detail.csv', 'utf8')
  .trim()
  .split('\n')
  .slice(1);

type Row = { month: string; status: string; exit: string; net: number };

const rows: Row[] = lines.map((line) => {
  const parts = line.split(',');
  return {
    month: (parts[0] ?? '').slice(0, 7),
    status: parts[4] ?? '',
    exit: parts[9] ?? '',
    net: parseFloat(parts[12] ?? '0') || 0,
  };
});

function executed(month: string | null): Row[] {
  const pool = month ? rows.filter((r) => r.month === month) : rows;
  return pool.filter((r) => r.status === 'executed');
}

function sumNet(pool: Row[]): number {
  return pool.reduce((acc, row) => acc + row.net, 0);
}

function exitMix(pool: Row[]): Record<string, number> {
  const mix: Record<string, number> = {};
  for (const row of pool) mix[row.exit] = (mix[row.exit] ?? 0) + 1;
  return mix;
}

function pipsByExit(pool: Row[], exit: string): number {
  return sumNet(pool.filter((r) => r.exit === exit));
}

for (const month of ['2026-05', '2026-06', '2026-07', null]) {
  const label = month ?? 'ALL';
  const exec = executed(month);
  console.log(`\n${label}: ${exec.length} executed trades, ${sumNet(exec).toFixed(1)}p total sim net`);
  console.log('  exit counts:', exitMix(exec));
  console.log('  pips by exit: trail_stop', pipsByExit(exec, 'trail_stop').toFixed(1),
    '| trail_sl', pipsByExit(exec, 'trail_sl_hit').toFixed(1),
    '| max_hold', pipsByExit(exec, 'max_hold').toFixed(1));
}

const blocked = rows.filter((r) => r.status === 'blocked_sequence' && r.month === '2026-05');
console.log(`\nMay sequence-blocked (skipped): ${blocked.length}`);
