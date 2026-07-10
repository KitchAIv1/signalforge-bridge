/**
 * Fetch helpers for AlphaOmega live machine panel (keeps the hook thin).
 */

import { getSupabase } from '@/lib/supabase';
import { OMEGA_LANE_B_BROKER_ID } from '@/lib/omegaLaneBConstants';
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

export async function fetchAlphaOmegaLiveState(): Promise<AlphaOmegaLiveFetchResult> {
  const supabase = getSupabase();
  const [streakResult, positionResult, lastExitResult] = await Promise.all([
    supabase.from('alpha_omega_streak_state').select('*').eq('id', 1).maybeSingle(),
    supabase
      .from('alpha_omega_position_state')
      .select('*')
      .eq('broker_id', OMEGA_LANE_B_BROKER_ID)
      .order('entry_fired_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('bridge_trade_log')
      .select('oanda_trade_id, direction, close_reason, closed_at, pnl_pips')
      .eq('broker_id', OMEGA_LANE_B_BROKER_ID)
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

  const mappedPosition = mapAlphaOmegaPositionRow(
    positionResult.data as Record<string, unknown> | null,
  );
  const tradeStatus = await fetchTradeLogStatus(mappedPosition?.oandaTradeId ?? null);
  return {
    streak: mapAlphaOmegaStreakRow(streakResult.data as Record<string, unknown> | null),
    openPosition: reconcileOpenPositionAgainstTradeLog(mappedPosition, tradeStatus),
    lastExit: mapAlphaOmegaLastExitRow(lastExitResult.data as Record<string, unknown> | null),
    errorMessage: null,
  };
}

async function fetchTradeLogStatus(oandaTradeId: string | null): Promise<string | null> {
  if (!oandaTradeId) return null;
  const { data, error } = await getSupabase()
    .from('bridge_trade_log')
    .select('status')
    .eq('oanda_trade_id', oandaTradeId)
    .eq('broker_id', OMEGA_LANE_B_BROKER_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data?.status as string | undefined) ?? null;
}
