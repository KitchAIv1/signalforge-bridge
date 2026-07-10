/**
 * Fresh-start wipe for ALPHAOMEGA Lane B UI/history.
 * Scope: oanda_phase2_demo bridge_trade_log + alpha_omega_* state only.
 * Lane A (oanda_practice) is never touched. Kill switch is never changed.
 *
 * Default: dry-run. Pass --apply to delete/reset.
 * Pass --force to allow wipe even if open position_state rows exist
 * (still warns; does NOT close OANDA trades).
 *
 * Run: npx tsx -r dotenv/config scripts/clearAlphaOmegaFreshStart.ts [--apply] [--force]
 */
import { createClient } from '@supabase/supabase-js';

const LANE_B_BROKER = 'oanda_phase2_demo';
const applyWrites = process.argv.includes('--apply');
const forceWipe = process.argv.includes('--force');

function createServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY');
  return createClient(url, key);
}

async function countLaneBTrades(supabase: ReturnType<typeof createServiceClient>) {
  const { count, error } = await supabase
    .from('bridge_trade_log')
    .select('id', { count: 'exact', head: true })
    .eq('broker_id', LANE_B_BROKER);
  if (error) throw new Error(`bridge_trade_log count: ${error.message}`);
  return count ?? 0;
}

async function countLaneBByStatus(supabase: ReturnType<typeof createServiceClient>) {
  const statuses = ['open', 'closed', 'pending'] as const;
  const counts: Record<string, number> = {};
  for (const status of statuses) {
    const { count, error } = await supabase
      .from('bridge_trade_log')
      .select('id', { count: 'exact', head: true })
      .eq('broker_id', LANE_B_BROKER)
      .eq('status', status);
    if (error) throw new Error(`status ${status}: ${error.message}`);
    counts[status] = count ?? 0;
  }
  return counts;
}

async function loadOpenPositionState(supabase: ReturnType<typeof createServiceClient>) {
  const { data, error } = await supabase
    .from('alpha_omega_position_state')
    .select('oanda_trade_id, broker_id, direction, entry_fired_at, opposing_fire_count')
    .eq('broker_id', LANE_B_BROKER);
  if (error) throw new Error(`position_state: ${error.message}`);
  return data ?? [];
}

async function loadStreakState(supabase: ReturnType<typeof createServiceClient>) {
  const { data, error } = await supabase
    .from('alpha_omega_streak_state')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error(`streak_state: ${error.message}`);
  return data;
}

async function deleteLaneBTradeLog(supabase: ReturnType<typeof createServiceClient>) {
  const { error, count } = await supabase
    .from('bridge_trade_log')
    .delete({ count: 'exact' })
    .eq('broker_id', LANE_B_BROKER);
  if (error) throw new Error(`delete trade log: ${error.message}`);
  return count ?? 0;
}

async function deletePositionState(supabase: ReturnType<typeof createServiceClient>) {
  const { error, count } = await supabase
    .from('alpha_omega_position_state')
    .delete({ count: 'exact' })
    .eq('broker_id', LANE_B_BROKER);
  if (error) throw new Error(`delete position_state: ${error.message}`);
  return count ?? 0;
}

async function resetStreakState(supabase: ReturnType<typeof createServiceClient>) {
  const { error } = await supabase
    .from('alpha_omega_streak_state')
    .upsert({
      id: 1,
      current_streak_direction: null,
      current_streak_length: 0,
      current_streak_start_at: null,
      last_fire_at: null,
      armed: false,
      armed_direction: null,
      last_processed_signal_id: null,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(`reset streak_state: ${error.message}`);
}

async function main() {
  const supabase = createServiceClient();
  const total = await countLaneBTrades(supabase);
  const byStatus = await countLaneBByStatus(supabase);
  const openPositions = await loadOpenPositionState(supabase);
  const streak = await loadStreakState(supabase);

  console.log('=== ALPHAOMEGA fresh-start audit (Lane B only) ===');
  console.log(`broker_id: ${LANE_B_BROKER}`);
  console.log(`bridge_trade_log rows: ${total}`);
  console.log(`  open=${byStatus.open} closed=${byStatus.closed} pending=${byStatus.pending}`);
  console.log(`alpha_omega_position_state: ${openPositions.length}`);
  for (const position of openPositions) {
    console.log(
      `  open ${position.direction} trade=${position.oanda_trade_id} opp=${position.opposing_fire_count}`,
    );
  }
  console.log(
    `streak: len=${streak?.current_streak_length ?? 0} dir=${streak?.current_streak_direction ?? '—'} armed=${streak?.armed ?? false}`,
  );
  console.log(`mode: ${applyWrites ? 'APPLY' : 'DRY-RUN'}`);

  if (byStatus.open > 0 || openPositions.length > 0) {
    console.log('');
    console.log('⚠ Open Lane B trades / position_state detected.');
    console.log('  Clearing history does NOT close OANDA trades.');
    console.log('  Close or reconcile open trades first, or pass --force with --apply.');
    if (applyWrites && !forceWipe) {
      console.error('Refusing to apply without --force while opens exist.');
      process.exit(1);
    }
  }

  if (!applyWrites) {
    console.log('');
    console.log('Dry-run only. Re-run with --apply to wipe Lane B history + reset state.');
    return;
  }

  const deletedTrades = await deleteLaneBTradeLog(supabase);
  const deletedPositions = await deletePositionState(supabase);
  await resetStreakState(supabase);

  console.log('');
  console.log('=== Applied ===');
  console.log(`deleted bridge_trade_log (Lane B): ${deletedTrades}`);
  console.log(`deleted alpha_omega_position_state: ${deletedPositions}`);
  console.log('reset alpha_omega_streak_state → idle');
  console.log('alpha_omega_enabled kill switch untouched');
  console.log('Lane A (oanda_practice) untouched');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
