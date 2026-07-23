/**
 * Fetch helpers for AlphaOmega live machine panel (keeps the hook thin).
 */

import { getSupabase } from '@/lib/supabase';
import { OMEGA_AO_BROKER_IDS } from '@/lib/omegaLaneBConstants';
import {
  mapAlphaOmegaPositionRow,
  mapAlphaOmegaStreakRow,
  type AlphaOmegaOpenPositionSnapshot,
  type AlphaOmegaStreakSnapshot,
} from '@/lib/alphaOmegaLiveStateMap';
import {
  mapAlphaOmegaLastExitRow,
  reconcileOpenPositionAgainstTradeLog,
  type AlphaOmegaLastExitSnapshot,
} from '@/lib/reconcileAlphaOmegaOpenPosition';

export interface AlphaOmegaLiveFetchResult {
  streak: AlphaOmegaStreakSnapshot | null;
  openPosition: AlphaOmegaOpenPositionSnapshot | null;
  lastExit: AlphaOmegaLastExitSnapshot | null;
  errorMessage: string | null;
}

function pickMostUrgentPosition(
  rows: AlphaOmegaOpenPositionSnapshot[],
): AlphaOmegaOpenPositionSnapshot | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => b.opposingFireCount - a.opposingFireCount)[0] ?? null;
}

export async function fetchAlphaOmegaLiveState(): Promise<AlphaOmegaLiveFetchResult> {
  const supabase = getSupabase();
  const [streakResult, positionResult, lastExitResult] = await Promise.all([
    supabase.from('alpha_omega_streak_state').select('*').eq('id', 1).maybeSingle(),
    supabase
      .from('alpha_omega_position_state')
      .select('*')
      .in('broker_id', [...OMEGA_AO_BROKER_IDS])
      .order('entry_fired_at', { ascending: false }),
    supabase
      .from('bridge_trade_log')
      .select('oanda_trade_id, direction, close_reason, closed_at, pnl_pips')
      .in('broker_id', [...OMEGA_AO_BROKER_IDS])
      .eq('engine_id', 'omega')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (streakResult.error || positionResult.error || lastExitResult.error) {
    return {
      streak: null,
      openPosition: null,
      lastExit: null,
      errorMessage:
        streakResult.error?.message ??
        positionResult.error?.message ??
        lastExitResult.error?.message ??
        'Load failed',
    };
  }

  const mappedPositions = ((positionResult.data ?? []) as Record<string, unknown>[])
    .map((row) => mapAlphaOmegaPositionRow(row))
    .filter((row): row is AlphaOmegaOpenPositionSnapshot => row != null);
  const mappedPosition = pickMostUrgentPosition(mappedPositions);
  const tradeStatus = await fetchTradeLogStatus(
    mappedPosition?.oandaTradeId ?? null,
    mappedPosition?.brokerId ?? null,
  );
  return {
    streak: mapAlphaOmegaStreakRow(streakResult.data as Record<string, unknown> | null),
    openPosition: reconcileOpenPositionAgainstTradeLog(mappedPosition, tradeStatus),
    lastExit: mapAlphaOmegaLastExitRow(lastExitResult.data as Record<string, unknown> | null),
    errorMessage: null,
  };
}

async function fetchTradeLogStatus(
  oandaTradeId: string | null,
  brokerId: string | null,
): Promise<string | null> {
  if (!oandaTradeId) return null;
  let query = getSupabase()
    .from('bridge_trade_log')
    .select('status')
    .eq('oanda_trade_id', oandaTradeId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (brokerId) query = query.eq('broker_id', brokerId);
  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return (data?.status as string | undefined) ?? null;
}
