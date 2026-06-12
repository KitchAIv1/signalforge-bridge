import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalInsertPayload } from '../connectors/supabase.js';
import { getBridgeConfigValue } from '../services/asianDetection/bridgeConfigHelpers.js';
import { countSameCurrencyExposure } from './correlationChecker.js';
import { hasOpenOppositePosition, countOpenSamePair } from './conflictResolver.js';
import { getNewsWindowEvent } from '../utils/newsCheck.js';

export type DirectionSide = 'long' | 'short';

export function normalizeDirection(rawDirection: string | null | undefined): DirectionSide | null {
  const upper = (rawDirection ?? '').toUpperCase().trim();
  if (upper === 'LONG' || upper === 'BUY') return 'long';
  if (upper === 'SHORT' || upper === 'SELL') return 'short';
  return null;
}

export function invertDirection(direction: DirectionSide): DirectionSide {
  return direction === 'long' ? 'short' : 'long';
}

export function toExecutionDirection(direction: DirectionSide): 'LONG' | 'SHORT' {
  return direction === 'long' ? 'LONG' : 'SHORT';
}

export async function fetchOpenTradesFromLog(
  supabase: SupabaseClient,
): Promise<Array<{ pair: string; units: number }>> {
  const { data } = await supabase
    .from('bridge_trade_log')
    .select('pair, units')
    .eq('status', 'open')
    .not('units', 'is', null);
  return (data ?? []).map((row: { pair: string; units: number }) => ({
    pair: row.pair,
    units: row.units ?? 0,
  }));
}

export async function isOmegaWindowExpired(supabase: SupabaseClient): Promise<boolean> {
  const validUntilStr = await getBridgeConfigValue(supabase, 'omega_direction_valid_until');
  if (validUntilStr == null) return true;
  const expiryMs = Date.parse(validUntilStr);
  if (!Number.isFinite(expiryMs)) return true;
  return Date.now() > expiryMs;
}

export async function hasRecentInverseDedup(
  supabase: SupabaseClient,
  oandaPair: string,
): Promise<boolean> {
  const cutoffIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('bridge_trade_log')
    .select('id')
    .eq('engine_id', 'omega_inverse')
    .eq('pair', oandaPair)
    .gte('signal_received_at', cutoffIso)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export async function runInverseNewsGate(
  oandaInstrument: string,
  omegaDirection: string,
  newsBlackoutEnabled: boolean,
): Promise<{ blocked: boolean; blockReason: string | null; eventName: string | null }> {
  if (!newsBlackoutEnabled) {
    return { blocked: false, blockReason: null, eventName: null };
  }
  const newsResult = await getNewsWindowEvent(oandaInstrument, omegaDirection.toLowerCase());
  if (newsResult?.blockReason != null) {
    return {
      blocked: true,
      blockReason: `NEWS_PRE_BLOCK:${newsResult.eventName ?? newsResult.blockReason}`,
      eventName: newsResult.eventName ?? null,
    };
  }
  return { blocked: false, blockReason: null, eventName: null };
}

export function mirrorStopLossForShort(
  entryPrice: number,
  originalStopLoss: number,
): number {
  const signalRSize = Math.abs(entryPrice - originalStopLoss);
  return entryPrice + signalRSize;
}

export function readPayloadSession(payload: SignalInsertPayload): string {
  const session = payload.session ?? payload.signal_session;
  return session != null ? String(session) : 'Unknown';
}

export function readPayloadScore(payload: SignalInsertPayload): number {
  const score = payload.confluence_score ?? payload.score;
  return score != null ? Number(score) : 0;
}

export function passesPerPairCap(
  openTrades: Array<{ pair: string }>,
  oandaPair: string,
  maxPerPairPositions: number,
): boolean {
  return countOpenSamePair(openTrades, oandaPair) < maxPerPairPositions;
}

export function passesCorrelationCap(
  openTrades: Array<{ pair: string; units: number }>,
  oandaPair: string,
  executionDirection: 'LONG' | 'SHORT',
  maxCorrelatedExposure: number,
): boolean {
  const { overLimit } = countSameCurrencyExposure(
    openTrades,
    oandaPair,
    executionDirection === 'LONG' ? 1 : -1,
    maxCorrelatedExposure,
  );
  return !overLimit;
}

export function hasOppositeOpenPosition(
  openTrades: Array<{ pair: string; units: number }>,
  oandaPair: string,
  executionDirection: 'LONG' | 'SHORT',
): boolean {
  return hasOpenOppositePosition(openTrades, oandaPair, executionDirection);
}

export type InverseRiskBlockReason =
  | 'OMEGA_WINDOW_EXPIRED'
  | 'NEWS_PRE_BLOCK'
  | 'Open opposite position'
  | 'Max per-pair positions reached'
  | 'Correlation cap exceeded';

export async function evaluateInverseRiskGates(
  supabase: SupabaseClient,
  openTrades: Array<{ pair: string; units: number }>,
  oandaPair: string,
  omegaDirection: string,
  invertedDirection: DirectionSide,
  newsBlackoutEnabled: boolean,
  maxPerPairPositions: number,
  maxCorrelatedExposure: number,
): Promise<{ blocked: false } | { blocked: true; reason: InverseRiskBlockReason | string }> {
  if (await isOmegaWindowExpired(supabase)) {
    return { blocked: true, reason: 'OMEGA_WINDOW_EXPIRED' };
  }
  const newsGate = await runInverseNewsGate(oandaPair, omegaDirection, newsBlackoutEnabled);
  if (newsGate.blocked) {
    return { blocked: true, reason: newsGate.blockReason ?? 'NEWS_PRE_BLOCK' };
  }
  if (await hasRecentInverseDedup(supabase, oandaPair)) {
    return { blocked: true, reason: 'DEDUP' };
  }
  const executionDirection = toExecutionDirection(invertedDirection);
  if (hasOppositeOpenPosition(openTrades, oandaPair, executionDirection)) {
    return { blocked: true, reason: 'Open opposite position' };
  }
  if (!passesPerPairCap(openTrades, oandaPair, maxPerPairPositions)) {
    return { blocked: true, reason: 'Max per-pair positions reached' };
  }
  if (
    !passesCorrelationCap(
      openTrades,
      oandaPair,
      executionDirection,
      maxCorrelatedExposure,
    )
  ) {
    return { blocked: true, reason: 'Correlation cap exceeded' };
  }
  return { blocked: false };
}
