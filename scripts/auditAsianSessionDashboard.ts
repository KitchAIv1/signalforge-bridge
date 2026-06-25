/**
 * Audit Asian session dashboard data vs DB (read-only).
 *
 * Run: npx tsx scripts/auditAsianSessionDashboard.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const FIRE_ACTIONS = new Set(['SET_LONG', 'SET_SHORT']);
const CRON_TIMES = ['01:00', '03:05', '04:05', '04:10'];

function lookbackTradeDate(days: number): string {
  const stamp = new Date();
  stamp.setUTCDate(stamp.getUTCDate() - days);
  return stamp.toISOString().slice(0, 10);
}

function isFireAction(action: string): boolean {
  return FIRE_ACTIONS.has(action);
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or service key');

  const supabase = createClient(url, key);
  const today = new Date().toISOString().slice(0, 10);
  const lookback = lookbackTradeDate(90);
  const rowLimit = 90 * 4;

  const { data: rows, error } = await supabase
    .from('asian_session_detection_log')
    .select(
      'id, trade_date, condition_check_time, condition_fired, action, direction_set, ' +
        'detection_net_pips, confidence_tier, prior_amd_tag, prior_direction_bias, ' +
        'failure_reason, evaluated_net_pips, evaluated_direction, candle_count, error_message, created_at',
    )
    .gte('trade_date', lookback)
    .order('trade_date', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(rowLimit);

  if (error) throw new Error(error.message);
  const logRows = rows ?? [];

  const { count: totalCount } = await supabase
    .from('asian_session_detection_log')
    .select('*', { count: 'exact', head: true })
    .gte('trade_date', lookback);

  const { data: bridgeConfig } = await supabase
    .from('bridge_config')
    .select('config_key, config_value')
    .in('config_key', [
      'omega_direction',
      'omega_direction_valid_until',
      'asian_detection_confidence',
      'asian_prior_amd_tag',
      'asian_prior_direction_bias',
      'asian_prior_amd_shifted',
      'direction_mode',
    ]);

  const config = new Map(
    (bridgeConfig ?? []).map(row => [String(row.config_key), row.config_value]),
  );

  const todayRows = logRows.filter(row => row.trade_date === today);
  const firedRows = logRows.filter(row => isFireAction(String(row.action)));
  const firedDates = new Set(firedRows.map(row => row.trade_date));
  const allDates = new Set(logRows.map(row => row.trade_date));
  const noFireDates = [...allDates].filter(date => !firedDates.has(date)).sort().reverse();

  const lines: string[] = [
    'ASIAN SESSION DASHBOARD AUDIT',
    `UTC now: ${new Date().toISOString()}`,
    `Today trade_date: ${today}`,
    '',
    '── FETCH LIMIT CHECK ──',
    `Rows loaded (dashboard cap ${rowLimit}): ${logRows.length}`,
    `Rows in DB last 90d: ${totalCount ?? 'unknown'}`,
    totalCount != null && totalCount > rowLimit
      ? `⚠ TRUNCATION RISK: dashboard may hide ${totalCount - rowLimit} older rows`
      : '✓ No truncation at 90d × 4 cap',
    '',
    '── bridge_config (live direction) ──',
    `direction_mode: ${config.get('direction_mode') ?? '—'}`,
    `omega_direction: ${config.get('omega_direction') ?? '—'}`,
    `omega_direction_valid_until: ${config.get('omega_direction_valid_until') ?? '—'}`,
    `asian_detection_confidence: ${config.get('asian_detection_confidence') ?? '—'}`,
    `asian_prior_amd_tag: ${config.get('asian_prior_amd_tag') ?? '—'}`,
    `asian_prior_direction_bias: ${config.get('asian_prior_direction_bias') ?? '—'}`,
    '',
    '── TODAY CRON CHECKLIST (what UI shows) ──',
  ];

  for (const cronTime of CRON_TIMES) {
    const row = todayRows.find(r => r.condition_check_time === cronTime);
    if (!row) {
      lines.push(`  ${cronTime}: (no row) → UI: Pending or No check`);
      continue;
    }
    lines.push(
      `  ${cronTime}: action=${row.action} dir=${row.direction_set ?? '—'} ` +
        `pips=${row.detection_net_pips ?? '—'} conf=${row.confidence_tier ?? '—'}`,
    );
  }

  const todayFire = todayRows.find(row => isFireAction(String(row.action)));
  lines.push('');
  lines.push(`Today FIRE row (UI header): ${todayFire ? `${todayFire.action} @ ${todayFire.condition_check_time}` : 'none'}`);
  lines.push(`Today fired in UI: ${todayFire != null}`);
  lines.push('');

  lines.push('── LAST 14 DAYS SUMMARY ──');
  const recentDates = [...allDates].sort().reverse().slice(0, 14);
  for (const date of recentDates) {
    const dayRows = logRows.filter(row => row.trade_date === date);
    const fire = dayRows.find(row => isFireAction(String(row.action)));
    const actions = dayRows.map(row => `${row.condition_check_time}:${row.action}`).join(' | ');
    if (fire) {
      lines.push(
        `  ${date} FIRE ${fire.action} (${fire.condition_fired} @ ${fire.condition_check_time}) ` +
          `[${actions}]`,
      );
    } else {
      lines.push(`  ${date} NO FIRE (${dayRows.length} checks) [${actions || 'no rows'}]`);
    }
  }

  lines.push('');
  lines.push('── NON-FIRE DAYS (UI collapsible) ──');
  lines.push(`Count in loaded window: ${noFireDates.length}`);
  for (const date of noFireDates.slice(0, 8)) {
    const dayRows = logRows.filter(row => row.trade_date === date);
    const prior = [...dayRows].reverse().find(row => row.prior_amd_tag)?.prior_amd_tag ?? '—';
    lines.push(`  ${date}: ${dayRows.length} checks · prior_amd=${prior}`);
  }

  lines.push('');
  lines.push('── ANOMALIES ──');
  let anomalyCount = 0;
  for (const row of logRows) {
    if (isFireAction(String(row.action)) && !row.direction_set) {
      lines.push(`  ⚠ ${row.trade_date} ${row.condition_check_time}: fire without direction_set`);
      anomalyCount += 1;
    }
    if (row.action === 'D1_FALLBACK' && row.trade_date === today) {
      lines.push(`  ℹ ${row.trade_date}: D1_FALLBACK today — sets direction but NOT counted as fire`);
    }
    if (String(row.action).startsWith('FETCH_INSUFFICIENT') && row.trade_date === today) {
      lines.push(`  ⚠ ${row.trade_date} ${row.condition_check_time}: ${row.action} (UI shows raw action)`);
      anomalyCount += 1;
    }
  }
  if (anomalyCount === 0) lines.push('  None detected in loaded rows.');

  console.log(lines.join('\n'));
}

void main().catch(err => {
  console.error(err);
  process.exit(1);
});
