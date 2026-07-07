import type { SupabaseClient } from '@supabase/supabase-js';
import {
  LANE_B_R1_ASIA_HOURS_ONLY,
  LANE_B_R1_COOLDOWN_MIN,
  LANE_B_R1_MAX_PRIOR_TRAIL_PIPS,
  OMEGA_LANE_B_BROKER_ID,
} from './omegaLaneBConstants.js';

export type FlipDirection = 'long' | 'short';

export interface FlipGateState {
  lastClosedAtMs: number;
  lastDirection: FlipDirection | null;
  lastCloseReason: string | null;
  lastPnlPips: number;
}

export interface FlipEntryCandidate {
  signalReceivedAt: string;
  direction: FlipDirection;
}

function isAsiaHour(iso: string): boolean {
  const hour = new Date(iso).getUTCHours();
  return hour >= 0 && hour <= 5;
}

function priorExitQualifies(state: FlipGateState): boolean {
  if (state.lastCloseReason !== 'trail_stop') return false;
  return state.lastPnlPips < LANE_B_R1_MAX_PRIOR_TRAIL_PIPS;
}

export function emptyFlipState(): FlipGateState {
  return {
    lastClosedAtMs: 0,
    lastDirection: null,
    lastCloseReason: null,
    lastPnlPips: 0,
  };
}

export function shouldBlockLaneBFlipEntry(
  candidate: FlipEntryCandidate,
  state: FlipGateState,
): boolean {
  if (state.lastDirection == null || state.lastClosedAtMs <= 0) return false;
  if (candidate.direction === state.lastDirection) return false;
  const firedMs = Date.parse(candidate.signalReceivedAt);
  if (firedMs >= state.lastClosedAtMs + LANE_B_R1_COOLDOWN_MIN * 60_000) return false;
  if (LANE_B_R1_ASIA_HOURS_ONLY && !isAsiaHour(candidate.signalReceivedAt)) return false;
  return priorExitQualifies(state);
}

function normDir(raw: string): FlipDirection | null {
  const d = raw.toLowerCase();
  if (d === 'long' || d === 'short') return d;
  return null;
}

export async function loadFlipStateForBroker(
  supabase: SupabaseClient,
  brokerId: string = OMEGA_LANE_B_BROKER_ID,
): Promise<FlipGateState> {
  const { data, error } = await supabase
    .from('bridge_trade_log')
    .select('closed_at, direction, close_reason, pnl_pips')
    .eq('engine_id', 'omega')
    .eq('broker_id', brokerId)
    .eq('decision', 'EXECUTED')
    .eq('status', 'closed')
    .not('closed_at', 'is', null)
    .order('closed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return emptyFlipState();

  const direction = normDir(String(data.direction ?? ''));
  const closedAt = String(data.closed_at ?? '');
  if (!direction || !closedAt) return emptyFlipState();

  return {
    lastClosedAtMs: Date.parse(closedAt),
    lastDirection: direction,
    lastCloseReason: data.close_reason != null ? String(data.close_reason) : null,
    lastPnlPips: Number(data.pnl_pips ?? 0),
  };
}
