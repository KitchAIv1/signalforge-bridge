/**
 * Client-side API calls for AO VT Markets guided bind.
 */

import type { AoVtBrokerSnapshot } from '@/lib/mt5/aoVtBindService';

export interface AoVtProbePayload {
  ok: boolean;
  equity: number | null;
  balance: number | null;
  openPositions: number | null;
  audusdSymbols?: string[];
  inferredSuffix?: string | null;
  error: string | null;
}

export interface AoVtStatusResponse {
  brokerId: string;
  snapshot: AoVtBrokerSnapshot | null;
  mt5Enabled: boolean;
  hasMetaApiToken: boolean;
  error?: string;
}

export interface AoVtBindResponse {
  ok?: boolean;
  brokerId?: string;
  probe?: AoVtProbePayload;
  snapshot?: AoVtBrokerSnapshot | null;
  warnings?: string[];
  error?: string;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function fetchAoVtStatus(): Promise<AoVtStatusResponse> {
  const response = await fetch('/api/mt5/status', { method: 'GET' });
  return readJson<AoVtStatusResponse>(response);
}

export async function bindAoVtAccount(
  metaApiAccountId: string,
  symbolSuffix: string,
): Promise<AoVtBindResponse> {
  const response = await fetch('/api/mt5/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metaApiAccountId, symbolSuffix }),
  });
  return readJson<AoVtBindResponse>(response);
}

export async function probeAoVtAccount(): Promise<AoVtBindResponse> {
  const response = await fetch('/api/mt5/probe', { method: 'POST' });
  return readJson<AoVtBindResponse>(response);
}

export async function saveAoVtSymbolSuffix(symbolSuffix: string): Promise<AoVtBindResponse> {
  const response = await fetch('/api/mt5/suffix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbolSuffix }),
  });
  return readJson<AoVtBindResponse>(response);
}

export async function disconnectAoVtAccount(): Promise<AoVtBindResponse & { note?: string }> {
  const response = await fetch('/api/mt5/disconnect', { method: 'POST' });
  return readJson<AoVtBindResponse & { note?: string }>(response);
}
