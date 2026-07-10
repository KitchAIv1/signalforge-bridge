/**
 * Bootstrap ALPHAOMEGA streak from recent Omega Bridge fires (all decisions).
 * Restores counting after cold start / wipe so an in-progress run is not lost.
 *
 * Default lookback 6h. Dry-run unless --apply.
 * Run: npx tsx -r dotenv/config scripts/bootstrapAlphaOmegaStreak.ts [--apply] [--hours=6]
 */
import { createClient } from '@supabase/supabase-js';
import {
  emptyStreakState,
  processFireForStreak,
  saveStreakState,
  type AlphaOmegaDirection,
  type StreakState,
} from '../src/core/alphaOmega/alphaOmegaStreakTracker.js';

const applyWrites = process.argv.includes('--apply');
const hoursArg = process.argv.find((arg) => arg.startsWith('--hours='));
const lookbackHours = hoursArg ? Number(hoursArg.split('=')[1]) : 6;

function createServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY');
  return createClient(url, key);
}

function normalizeDirection(raw: string | null): AlphaOmegaDirection | null {
  const upper = (raw ?? '').toUpperCase();
  if (upper === 'LONG' || upper === 'BUY') return 'LONG';
  if (upper === 'SHORT' || upper === 'SELL') return 'SHORT';
  return null;
}

interface FireRow {
  signalId: string;
  direction: AlphaOmegaDirection;
  firedAt: string;
}

async function loadRecentOmegaFires(
  supabase: ReturnType<typeof createServiceClient>,
  sinceIso: string,
): Promise<FireRow[]> {
  const fires: FireRow[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('bridge_trade_log')
      .select('signal_id, direction, created_at, signal_received_at')
      .eq('engine_id', 'omega')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      const signalId = row.signal_id != null ? String(row.signal_id) : null;
      const direction = normalizeDirection(row.direction != null ? String(row.direction) : null);
      if (!signalId || !direction || seen.has(signalId)) continue;
      seen.add(signalId);
      fires.push({
        signalId,
        direction,
        firedAt: String(row.signal_received_at ?? row.created_at),
      });
    }
    if (data.length < 1000) break;
  }
  return fires;
}

function replayFires(fires: FireRow[]): StreakState {
  let state = emptyStreakState();
  for (const fire of fires) {
    const result = processFireForStreak(state, {
      direction: fire.direction,
      firedAt: fire.firedAt,
      signalId: fire.signalId,
    });
    state = result.nextState;
  }
  return state;
}

async function main(): Promise<void> {
  const supabase = createServiceClient();
  const sinceIso = new Date(Date.now() - lookbackHours * 3600_000).toISOString();
  const fires = await loadRecentOmegaFires(supabase, sinceIso);
  const nextState = replayFires(fires);

  console.log(`=== ALPHAOMEGA streak bootstrap (${lookbackHours}h) ===`);
  console.log(`fires deduped: ${fires.length}`);
  console.log(
    `result: dir=${nextState.currentStreakDirection} len=${nextState.currentStreakLength} armed=${nextState.armed} armedDir=${nextState.armedDirection}`,
  );
  console.log(`lastFire=${nextState.lastFireAt} lastSignal=${nextState.lastProcessedSignalId}`);
  console.log(`mode: ${applyWrites ? 'APPLY' : 'DRY-RUN'}`);

  if (!applyWrites) {
    console.log('Re-run with --apply to write alpha_omega_streak_state.');
    return;
  }
  await saveStreakState(supabase, nextState);
  console.log('Saved streak state.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
