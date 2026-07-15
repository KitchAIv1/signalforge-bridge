/**
 * Read-only fetch of recent w5/c0 shadow fires for Centroid Check UI.
 * Does not write, mutate config, or call the matcher.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OMEGA_CENTROID_LOOKBACK_DAYS,
  OMEGA_CENTROID_PATTERN_ID,
  OMEGA_CENTROID_RECENT_LIMIT,
} from '@/lib/omegaCentroidConstants';
import type { CentroidFireSample } from '@/lib/omegaCentroidHealthStats';

const SELECT_COLS =
  'id, fired_at, direction, centroid_distance, confidence, session, final_outcome, pattern_id';

export interface FetchOmegaCentroidHealthResult {
  fires: CentroidFireSample[];
  errorMessage: string | null;
}

function mapFireRow(row: Record<string, unknown>): CentroidFireSample | null {
  const id = row.id != null ? String(row.id) : '';
  const firedAt = row.fired_at != null ? String(row.fired_at) : '';
  const distance = Number(row.centroid_distance);
  if (!id || !firedAt || !Number.isFinite(distance)) return null;
  return {
    id,
    firedAt,
    direction: String(row.direction ?? '—'),
    centroidDistance: distance,
    confidence: Number(row.confidence) || 0,
    session: String(row.session ?? '—'),
    finalOutcome: row.final_outcome != null ? String(row.final_outcome) : null,
  };
}

export async function fetchOmegaCentroidHealth(
  supabase: SupabaseClient,
): Promise<FetchOmegaCentroidHealthResult> {
  const sinceIso = new Date(
    Date.now() - OMEGA_CENTROID_LOOKBACK_DAYS * 86_400_000,
  ).toISOString();

  const { data, error } = await supabase
    .from('omega_shadow_signals')
    .select(SELECT_COLS)
    .eq('pattern_id', OMEGA_CENTROID_PATTERN_ID)
    .gte('fired_at', sinceIso)
    .order('fired_at', { ascending: false })
    .limit(OMEGA_CENTROID_RECENT_LIMIT);

  if (error) {
    return { fires: [], errorMessage: error.message };
  }

  const fires: CentroidFireSample[] = [];
  for (const raw of data ?? []) {
    const mapped = mapFireRow(raw as Record<string, unknown>);
    if (mapped) fires.push(mapped);
  }
  return { fires, errorMessage: null };
}
