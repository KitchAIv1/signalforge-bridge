import type { Dispatch, SetStateAction } from 'react';
import type { AoVtBrokerSnapshot } from '@/lib/mt5/aoVtBindService';
import type { AoVtProbePayload } from '@/services/AoVtConnectService';
import {
  bindAoVtAccount,
  disconnectAoVtAccount,
  probeAoVtAccount,
  saveAoVtSymbolSuffix,
} from '@/services/AoVtConnectService';

type SetSnapshot = Dispatch<SetStateAction<AoVtBrokerSnapshot | null>>;
type SetProbe = Dispatch<SetStateAction<AoVtProbePayload | null>>;
type SetString = Dispatch<SetStateAction<string | null>>;
type SetWarnings = Dispatch<SetStateAction<string[]>>;

export async function runAoVtBind(
  metaApiAccountId: string,
  symbolSuffix: string,
  setSnapshot: SetSnapshot,
  setLastProbe: SetProbe,
  setWarnings: SetWarnings,
  setErrorMessage: SetString,
): Promise<boolean> {
  const result = await bindAoVtAccount(metaApiAccountId, symbolSuffix);
  if (result.error || !result.ok) {
    setErrorMessage(result.error ?? 'Bind failed');
    return false;
  }
  setSnapshot(result.snapshot ?? null);
  setLastProbe(result.probe ?? null);
  setWarnings(result.warnings ?? []);
  return true;
}

export async function runAoVtProbe(
  setSnapshot: SetSnapshot,
  setLastProbe: SetProbe,
  setErrorMessage: SetString,
): Promise<void> {
  const result = await probeAoVtAccount();
  if (result.error && !result.probe) {
    setErrorMessage(result.error);
    return;
  }
  setLastProbe(result.probe ?? null);
  setSnapshot(result.snapshot ?? null);
  if (!result.ok) setErrorMessage(result.error ?? result.probe?.error ?? 'Probe failed');
}

export async function runAoVtSaveSuffix(
  symbolSuffix: string,
  setSnapshot: SetSnapshot,
  setErrorMessage: SetString,
  setNote: SetString,
): Promise<boolean> {
  const result = await saveAoVtSymbolSuffix(symbolSuffix);
  if (result.error || !result.ok) {
    setErrorMessage(result.error ?? 'Failed to save symbol suffix');
    return false;
  }
  setSnapshot(result.snapshot ?? null);
  setNote(`Symbol suffix saved: ${result.snapshot?.symbolSuffix ?? symbolSuffix}`);
  return true;
}

export async function runAoVtDisconnect(
  setSnapshot: SetSnapshot,
  setLastProbe: SetProbe,
  setNote: SetString,
  setWarnings: SetWarnings,
  setErrorMessage: SetString,
): Promise<void> {
  const result = await disconnectAoVtAccount();
  if (result.error) {
    setErrorMessage(result.error);
    return;
  }
  setSnapshot(result.snapshot ?? null);
  setLastProbe(null);
  setNote(result.note ?? null);
  setWarnings([]);
}
