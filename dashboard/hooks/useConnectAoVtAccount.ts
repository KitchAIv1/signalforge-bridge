'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AoVtBrokerSnapshot } from '@/lib/mt5/aoVtBindService';
import type { AoVtProbePayload } from '@/services/AoVtConnectService';
import { fetchAoVtStatus } from '@/services/AoVtConnectService';
import { useConnectAoVtMutations } from '@/hooks/useConnectAoVtMutations';

export interface ConnectAoVtState {
  loading: boolean;
  busy: boolean;
  snapshot: AoVtBrokerSnapshot | null;
  lastProbe: AoVtProbePayload | null;
  mt5Enabled: boolean;
  hasMetaApiToken: boolean;
  errorMessage: string | null;
  warnings: string[];
  note: string | null;
  refresh: () => Promise<void>;
  bind: (metaApiAccountId: string, symbolSuffix: string) => Promise<boolean>;
  probe: () => Promise<void>;
  saveSuffix: (symbolSuffix: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
}

export function useConnectAoVtAccount(): ConnectAoVtState {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<AoVtBrokerSnapshot | null>(null);
  const [lastProbe, setLastProbe] = useState<AoVtProbePayload | null>(null);
  const [mt5Enabled, setMt5Enabled] = useState(false);
  const [hasMetaApiToken, setHasMetaApiToken] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const mutations = useConnectAoVtMutations({
    setBusy,
    setSnapshot,
    setLastProbe,
    setWarnings,
    setErrorMessage,
    setNote,
  });

  const refresh = useCallback(async () => {
    setErrorMessage(null);
    const status = await fetchAoVtStatus();
    if (status.error) {
      setErrorMessage(status.error);
      setLoading(false);
      return;
    }
    setSnapshot(status.snapshot);
    setMt5Enabled(status.mt5Enabled);
    setHasMetaApiToken(status.hasMetaApiToken);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    loading,
    busy,
    snapshot,
    lastProbe,
    mt5Enabled,
    hasMetaApiToken,
    errorMessage,
    warnings,
    note,
    refresh,
    ...mutations,
  };
}
