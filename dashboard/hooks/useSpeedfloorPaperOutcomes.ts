'use client';

import { useEffect, useMemo, useState } from 'react';
import { isSpeedfloorShadowRow } from '@/lib/alphaOmegaPaper/isSpeedfloorShadowRow';
import type { SpeedfloorPaperOutcome } from '@/lib/alphaOmegaPaper/paperSimTypes';
import type { BridgeTradeLogRow } from '@/lib/types';

export function useSpeedfloorPaperOutcomes(tradeRows: BridgeTradeLogRow[]) {
  const shadowIds = useMemo(() => {
    const ids = tradeRows.filter(isSpeedfloorShadowRow).map((row) => row.id);
    return [...new Set(ids)].sort().join(',');
  }, [tradeRows]);

  const [byTradeId, setByTradeId] = useState<Record<string, SpeedfloorPaperOutcome>>(
    {},
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shadowIds) {
      setByTradeId({});
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch('/api/alphaomega/speedfloor-paper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradeIds: shadowIds.split(',') }),
    })
      .then(async (res) => {
        const json = (await res.json()) as {
          outcomes?: Record<string, SpeedfloorPaperOutcome>;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (!cancelled) setByTradeId(json.outcomes ?? {});
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shadowIds]);

  return { byTradeId, loading, error };
}
