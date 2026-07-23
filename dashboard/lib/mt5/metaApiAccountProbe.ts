/**
 * Server-only MetaApi equity + AUDUSD suffix probe for guided VT bind.
 */

import { discoverAudusdSuffixFromRpc } from '@/lib/mt5/discoverMt5AudusdSuffix';
import { openMetaApiRpc } from '@/lib/mt5/openMetaApiRpc';

const PROBE_TIMEOUT_MS = 45_000;

export interface MetaApiProbeResult {
  ok: boolean;
  equity: number | null;
  balance: number | null;
  openPositions: number | null;
  audusdSymbols: string[];
  inferredSuffix: string | null;
  error: string | null;
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${PROBE_TIMEOUT_MS}ms`)),
      PROBE_TIMEOUT_MS,
    );
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function emptyProbe(error: string): MetaApiProbeResult {
  return {
    ok: false,
    equity: null,
    balance: null,
    openPositions: null,
    audusdSymbols: [],
    inferredSuffix: null,
    error,
  };
}

export async function probeMetaApiAccount(metaApiAccountId: string): Promise<MetaApiProbeResult> {
  try {
    const rpc = await withTimeout(openMetaApiRpc(metaApiAccountId), 'MetaApi probe');
    const info = await rpc.getAccountInformation();
    const positions = await rpc.getPositions();
    const discovery = await discoverAudusdSuffixFromRpc(rpc);
    return {
      ok: true,
      equity: typeof info.equity === 'number' ? info.equity : Number(info.equity ?? NaN) || null,
      balance: typeof info.balance === 'number' ? info.balance : Number(info.balance ?? NaN) || null,
      openPositions: Array.isArray(positions) ? positions.length : null,
      audusdSymbols: discovery.symbols,
      inferredSuffix: discovery.inferredSuffix,
      error: null,
    };
  } catch (err) {
    return emptyProbe(String(err));
  }
}

export function isMetaApiAccountUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}
