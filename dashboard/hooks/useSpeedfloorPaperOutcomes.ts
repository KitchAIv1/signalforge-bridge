'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchSpeedfloorPaperChunks } from '@/lib/alphaOmegaPaper/fetchSpeedfloorPaperChunks';
import {
  hydrateStoredSpeedfloorOutcomes,
  openSpeedfloorTradeIds,
} from '@/lib/alphaOmegaPaper/hydrateStoredSpeedfloorOutcomes';
import type { SpeedfloorPaperOutcome } from '@/lib/alphaOmegaPaper/paperSimTypes';
import type { BridgeTradeLogRow } from '@/lib/types';

/**
 * Prefer stored SPEEDFLOOR closes from already-loaded rows.
 * API/sim only for still-open shadows (avoids 40-id truncate blanking PnL).
 */
export function useSpeedfloorPaperOutcomes(tradeRows: BridgeTradeLogRow[]) {
  const storedByTradeId = useMemo(
    () => hydrateStoredSpeedfloorOutcomes(tradeRows),
    [tradeRows],
  );
  const openIdsKey = useMemo(
    () => openSpeedfloorTradeIds(tradeRows).sort().join(','),
    [tradeRows],
  );

  const [simByTradeId, setSimByTradeId] = useState<
    Record<string, SpeedfloorPaperOutcome>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!openIdsKey) {
      setSimByTradeId({});
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchSpeedfloorPaperChunks(openIdsKey.split(','))
      .then((outcomes) => {
        if (!cancelled) setSimByTradeId(outcomes);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSimByTradeId({});
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openIdsKey]);

  const byTradeId = useMemo(
    () => ({ ...simByTradeId, ...storedByTradeId }),
    [simByTradeId, storedByTradeId],
  );

  return { byTradeId, loading, error };
}
