'use client';

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { AoVtBrokerSnapshot } from '@/lib/mt5/aoVtBindService';
import type { AoVtProbePayload } from '@/services/AoVtConnectService';
import {
  runAoVtBind,
  runAoVtDisconnect,
  runAoVtProbe,
  runAoVtSaveSuffix,
} from '@/hooks/aoVtConnectActions';

type SetSnapshot = Dispatch<SetStateAction<AoVtBrokerSnapshot | null>>;
type SetProbe = Dispatch<SetStateAction<AoVtProbePayload | null>>;
type SetString = Dispatch<SetStateAction<string | null>>;
type SetWarnings = Dispatch<SetStateAction<string[]>>;
type SetBusy = Dispatch<SetStateAction<boolean>>;

export function useConnectAoVtMutations(params: {
  setBusy: SetBusy;
  setSnapshot: SetSnapshot;
  setLastProbe: SetProbe;
  setWarnings: SetWarnings;
  setErrorMessage: SetString;
  setNote: SetString;
}) {
  const { setBusy, setSnapshot, setLastProbe, setWarnings, setErrorMessage, setNote } = params;

  const bind = useCallback(
    async (metaApiAccountId: string, symbolSuffix: string): Promise<boolean> => {
      setBusy(true);
      setErrorMessage(null);
      setNote(null);
      const ok = await runAoVtBind(
        metaApiAccountId,
        symbolSuffix,
        setSnapshot,
        setLastProbe,
        setWarnings,
        setErrorMessage,
      );
      setBusy(false);
      return ok;
    },
    [setBusy, setSnapshot, setLastProbe, setWarnings, setErrorMessage, setNote],
  );

  const probe = useCallback(async () => {
    setBusy(true);
    setErrorMessage(null);
    await runAoVtProbe(setSnapshot, setLastProbe, setErrorMessage);
    setBusy(false);
  }, [setBusy, setSnapshot, setLastProbe, setErrorMessage]);

  const saveSuffix = useCallback(
    async (symbolSuffix: string): Promise<boolean> => {
      setBusy(true);
      setErrorMessage(null);
      setNote(null);
      const ok = await runAoVtSaveSuffix(symbolSuffix, setSnapshot, setErrorMessage, setNote);
      setBusy(false);
      return ok;
    },
    [setBusy, setSnapshot, setErrorMessage, setNote],
  );

  const disconnect = useCallback(async () => {
    setBusy(true);
    setErrorMessage(null);
    await runAoVtDisconnect(setSnapshot, setLastProbe, setNote, setWarnings, setErrorMessage);
    setBusy(false);
  }, [setBusy, setSnapshot, setLastProbe, setNote, setWarnings, setErrorMessage]);

  return { bind, probe, saveSuffix, disconnect };
}
