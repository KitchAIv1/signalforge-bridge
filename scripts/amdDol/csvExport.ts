import * as fs from 'fs';
import * as path from 'path';
import { csvEscape } from '../amdBackfillCsv.js';
import type { DolBacktestRow } from './types.js';

const CSV_COLUMNS: (keyof DolBacktestRow)[] = [
  'trade_date',
  'amd_tag',
  'daily_bias_alignment',
  'layer4_d1_bias',
  'layer4_bullish_count',
  'layer4_bearish_count',
  'layer4_d1_bias_7',
  'layer4_bullish_count_7',
  'layer4_bearish_count_7',
  'm5_vs_judas_direction',
  'judas_direction',
  'judas_pips',
  'judas_extreme_price',
  'asian_range_pips',
  'asian_is_flat',
  'asian_high',
  'asian_low',
  'asian_open',
  'asian_close',
  'asian_close_position_pct',
  'asian_close_bias',
  'prev_day_high',
  'prev_day_low',
  'prev_day_close',
  'prev_week_high',
  'prev_week_low',
  'weekly_open',
  'monthly_open',
  'weekly_open_bias_computed',
  'monthly_open_bias_computed',
  'prev_day_position',
  'asian_swept_prev_low',
  'asian_swept_prev_high',
  'judas_swept_prev_low',
  'judas_swept_prev_high',
  'prior_d1_direction',
  'prior_d1_body_pips',
  'asian_clean_trend_matched',
  'weekly_monthly_source',
  'daily_candle_time_raw',
  'daily_open',
  'daily_high',
  'daily_low',
  'daily_close',
  'daily_close_direction',
  'entry_bar_index',
  'entry_price',
  'dist_open',
  'dist_high',
  'dist_low',
  'dol_primary_target',
  'dol_target_distance_pips',
  'dol_already_passed',
  'dol_reached',
  'bar_index_dol_reached',
  'dol_reached_in_ny_am',
  'dol_week_target',
  'dol_week_already_passed',
  'dol_week_reached',
  'outcome_direction_from_tag',
  'amd_outcome_tag',
  'predicted_judas_inversion_raw',
  'predicted_auto_direction',
  'predicted_production',
  'daily_close_matches_inversion',
  'daily_close_matches_auto',
  'daily_close_matches_production',
  'outcome_matches_production',
  'peak_favorable_pips',
  'peak_counter_pips',
  'bar_index_peak_favorable',
  'ny_am_peak',
  'net_pips_full',
];

export function writeDolCsv(rows: DolBacktestRow[]): string {
  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'amd_dol_direction_backtest.csv');
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((column) => csvEscape(row[column])).join(','));
  }
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  return outPath;
}
