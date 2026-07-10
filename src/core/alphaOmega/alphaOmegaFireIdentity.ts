/**
 * Fire identity helpers for ALPHAOMEGA observation — direction/engine only.
 * Intentionally independent of validateSignal so rSize&lt;4 fires still count.
 */

import type { SignalInsertPayload } from '../../connectors/supabase.js';
import type { AlphaOmegaDirection } from './alphaOmegaStreakTracker.js';

export function readOmegaEngineId(payload: SignalInsertPayload): string | null {
  const raw = payload.engine_id ?? payload.provider_id ?? (payload as Record<string, unknown>).engineId;
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim().toLowerCase();
}

export function readOmegaFireDirection(payload: SignalInsertPayload): AlphaOmegaDirection | null {
  const raw = (payload.direction ?? '').toString().toUpperCase();
  if (raw === 'LONG' || raw === 'BUY') return 'LONG';
  if (raw === 'SHORT' || raw === 'SELL') return 'SHORT';
  return null;
}

export function isOmegaEnginePayload(payload: SignalInsertPayload): boolean {
  return readOmegaEngineId(payload) === 'omega';
}

export function readOmegaFireTimestamp(payload: SignalInsertPayload): string {
  return String(payload.created_at ?? new Date().toISOString());
}

export function readOmegaSignalId(payload: SignalInsertPayload): string {
  return String(payload.id ?? '').trim();
}
