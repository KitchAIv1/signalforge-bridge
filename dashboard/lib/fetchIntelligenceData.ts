import { getSupabase } from '@/lib/supabase';
import { OPTIMAL_WINDOWS } from '@/lib/intelligenceConstants';
import { buildIntelDashboardSlices } from '@/lib/intelligenceAgg';
import type { IntelligenceData, IntelligenceSnapshot } from '@/lib/intelligenceTypes';

/** Re-export documented hour-band map for Intelligence UI slices */
export { OPTIMAL_WINDOWS };

/** First UTC day with reliable amd_tag on bridge_trade_log Omega executes */
const AMD_CLEAN_DATA_START = '2026-05-20';

function coerceConfigString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function sliceRollingIntelDates(): { todaySlice: string; thirtyDaysPastSlice: string } {
  const todaySlice = new Date().toISOString().slice(0, 10);
  const thirtyDaysPastSlice = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return { todaySlice, thirtyDaysPastSlice };
}

async function fetchAmdDailySnapshot(pairLabel: string, todaySlice: string) {
  const supabase = getSupabase();
  return supabase
    .from('amd_state')
    .select('evaluated_at, amd_tag, auto_direction, amd_size_multiplier')
    .eq('pair', pairLabel)
    .eq('trade_date', todaySlice)
    .maybeSingle();
}

async function fetchDirectionConfigRowsSnapshot() {
  const supabase = getSupabase();
  return supabase
    .from('bridge_config')
    .select('config_key, config_value')
    .in('config_key', ['direction_mode', 'omega_direction']);
}

async function fetchTaggedExecutedTradesRolling(sinceUtcDay: string) {
  const boundaryIso = `${sinceUtcDay}T00:00:00Z`;
  const supabase = getSupabase();
  return supabase
    .from('bridge_trade_log')
    .select(
      'amd_tag, direction_source, amd_size_multiplier, pnl_r, result, created_at',
    )
    .eq('engine_id', 'omega')
    .eq('decision', 'EXECUTED')
    .not('amd_tag', 'is', null)
    .not('pnl_r', 'is', null)
    .in('result', ['win', 'loss'])
    .gte('created_at', boundaryIso)
    .order('created_at', { ascending: false });
}

async function fetchAccumulationRolling(pairLabel: string, sinceUtcDay: string) {
  const supabase = getSupabase();
  return supabase
    .from('amd_state')
    .select('asian_range_pips, asian_is_flat, amd_tag, trade_date')
    .eq('pair', pairLabel)
    .gte('trade_date', sinceUtcDay)
    .order('trade_date', { ascending: false });
}

async function fetchLatestStoredSnapshotRow() {
  const supabase = getSupabase();
  return supabase
    .from('intelligence_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();
}

async function readIntelDatasetRows(
  pairLabel: string,
  todaySlice: string,
  tradeLogSinceUtcDay: string,
  accumSinceUtcDay: string,
) {
  return Promise.all([
    fetchAmdDailySnapshot(pairLabel, todaySlice),
    fetchDirectionConfigRowsSnapshot(),
    fetchTaggedExecutedTradesRolling(tradeLogSinceUtcDay),
    fetchAccumulationRolling(pairLabel, accumSinceUtcDay),
    fetchLatestStoredSnapshotRow(),
  ]);
}

function pickDirectionHarness(configRowsUnknown: unknown): {
  direction_mode: string | null;
  omega_direction: string | null;
} {
  const configRowsTyped = (configRowsUnknown ?? []) as {
    config_key: string;
    config_value: unknown;
  }[];
  return {
    direction_mode: coerceConfigString(
      configRowsTyped.find((cfg) => cfg.config_key === 'direction_mode')
        ?.config_value,
    ),
    omega_direction: coerceConfigString(
      configRowsTyped.find((cfg) => cfg.config_key === 'omega_direction')
        ?.config_value,
    ),
  };
}

function materializeIntelViewModel(bundle: {
  todayAmdRow: {
    evaluated_at: string | null;
    amd_tag: string | null;
    auto_direction: string | null;
    amd_size_multiplier: number | null;
  } | null;
  cfgRowsEnvelope: unknown;
  taggedRollingBatch:
    | {
        amd_tag: string;
        direction_source: string | null;
        amd_size_multiplier: number | null;
        pnl_r: number;
        result: string;
        created_at: string;
      }[]
    | null;
  amdAccumRollingRows:
    | {
        asian_range_pips: number | null;
        asian_is_flat: boolean | null;
        amd_tag: string;
      }[]
    | null;
  newestStoredSnapshotRow: IntelligenceSnapshot | null;
}): IntelligenceData {
  const { direction_mode, omega_direction } = pickDirectionHarness(bundle.cfgRowsEnvelope);

  const taggedTradesRoll = bundle.taggedRollingBatch ?? [];
  const accumRollingRowsSlice = bundle.amdAccumRollingRows ?? [];

  const slicePack = buildIntelDashboardSlices(
    accumRollingRowsSlice,
    taggedTradesRoll,
    OPTIMAL_WINDOWS,
  );

  return {
    last_amd_evaluated_at: bundle.todayAmdRow?.evaluated_at ?? null,
    direction_mode,
    omega_direction,
    today_amd_tag: bundle.todayAmdRow?.amd_tag ?? null,
    today_auto_direction: bundle.todayAmdRow?.auto_direction ?? null,
    today_size_multiplier: bundle.todayAmdRow?.amd_size_multiplier ?? null,
    total_amd_tagged_trades: taggedTradesRoll.length,
    ...slicePack,
    last_snapshot: bundle.newestStoredSnapshotRow,
  };
}

/** Supabase ingest + rollup for Intelligence dashboards */
export async function fetchIntelligenceData(): Promise<IntelligenceData> {
  const audUsdPair = 'AUD_USD';
  const { todaySlice, thirtyDaysPastSlice } = sliceRollingIntelDates();
  const [todaySnap, cfgSnap, taggedSnap, amdAccumSnap, newestSnapShot] =
    await readIntelDatasetRows(
      audUsdPair,
      todaySlice,
      AMD_CLEAN_DATA_START,
      thirtyDaysPastSlice,
    );

  return materializeIntelViewModel({
    todayAmdRow: todaySnap.data as {
      evaluated_at: string | null;
      amd_tag: string | null;
      auto_direction: string | null;
      amd_size_multiplier: number | null;
    } | null,
    cfgRowsEnvelope: cfgSnap.data,
    taggedRollingBatch: taggedSnap.data as
      | {
          amd_tag: string;
          direction_source: string | null;
          amd_size_multiplier: number | null;
          pnl_r: number;
          result: string;
          created_at: string;
        }[]
      | null,
    amdAccumRollingRows: amdAccumSnap.data as
      | {
          asian_range_pips: number | null;
          asian_is_flat: boolean | null;
          amd_tag: string;
        }[]
      | null,
    newestStoredSnapshotRow:
      (newestSnapShot.data as IntelligenceSnapshot | null) ?? null,
  });
}
