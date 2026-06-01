import * as fs from 'fs';
import * as path from 'path';
import type { DayBackfillResult } from './types.js';
import { OUTPUT_CSV } from './types.js';

export const CSV_HEADERS = [
  'trade_date',
  'status',
  'amd_tag_computed',
  'decision_direction',
  'auto_direction_db',
  'changed',
  'flagged_tag',
  'asian_is_flat',
  'reversal_confirmed',
  'd1_bars_raw',
  'd1_bars_used',
  'd1_last_dropped_time',
  'layer4_bullish',
  'layer4_bearish',
  'layer4_d1_bias',
  'error_message',
];

function csvEscape(value: string | boolean | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowToCsvCells(row: DayBackfillResult): string[] {
  return [
    row.trade_date,
    row.status,
    row.amd_tag_computed,
    row.decision_direction,
    row.auto_direction_db,
    row.changed,
    row.flagged_tag,
    row.asian_is_flat,
    row.reversal_confirmed,
    row.d1_bars_raw,
    row.d1_bars_used,
    row.d1_last_dropped_time,
    row.layer4_bullish,
    row.layer4_bearish,
    row.layer4_d1_bias,
    row.error_message,
  ].map(csvEscape);
}

export function writeBackfillCsv(rows: DayBackfillResult[]): string {
  const outPath = path.resolve(OUTPUT_CSV);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const lines = [
    CSV_HEADERS.join(','),
    ...rows.map((row) => rowToCsvCells(row).join(',')),
  ];

  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  return outPath;
}

export function printCsvPreview(rows: DayBackfillResult[], limit: number): void {
  const preview = rows.slice(0, limit);
  console.log('\n--- CSV preview (first rows) ---');
  console.log(CSV_HEADERS.join(','));
  for (const row of preview) {
    console.log(rowToCsvCells(row).join(','));
  }
}

export function printChangedDowDistribution(rows: DayBackfillResult[]): void {
  const sqlDow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const changed = rows.filter((row) => row.changed);
  const counts = new Array(7).fill(0);

  for (const row of changed) {
    const date = new Date(`${row.trade_date}T00:00:00Z`);
    const dow = (date.getUTCDay() + 0) % 7;
    counts[dow]++;
  }

  console.log('\n--- Changed days DOW distribution (SQL: 0=Sun) ---');
  console.log(`Total changed: ${changed.length}`);
  for (let dow = 0; dow < 7; dow++) {
    console.log(`  ${sqlDow[dow]} (DOW=${dow}): ${counts[dow]}`);
  }
}
