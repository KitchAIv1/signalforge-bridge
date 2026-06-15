'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchOmegaInverseData } from '@/lib/fetchOmegaInverseData';
import { OMEGA_INVERSE_POLL_MS } from '@/lib/omegaInverseConstants';
import type { OmegaInverseData } from '@/lib/omegaInverseTypes';
import { OmegaInverseGates } from '@/components/omegaInverse/OmegaInverseGates';
import { OmegaInverseHeader } from '@/components/omegaInverse/OmegaInverseHeader';
import { OmegaInverseHistoryTable } from '@/components/omegaInverse/OmegaInverseHistoryTable';
import { OmegaInverseShadowTable } from '@/components/omegaInverse/OmegaInverseShadowTable';
import { OmegaInverseTodayPanel } from '@/components/omegaInverse/OmegaInverseTodayPanel';

export default function OmegaInversePage() {
  const [payload, setPayload] = useState<OmegaInverseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPayload = useCallback(async () => {
    try {
      const nextPayload = await fetchOmegaInverseData();
      setPayload(nextPayload);
      setError(null);
      console.log('[OmegaInverse] poll refresh', new Date().toISOString());
    } catch (loadErr: unknown) {
      setError(loadErr instanceof Error ? loadErr.message : String(loadErr));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPayload();
    const ticker = setInterval(() => {
      void loadPayload();
    }, OMEGA_INVERSE_POLL_MS);
    return () => clearInterval(ticker);
  }, [loadPayload]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-400">Loading Omega Inverse...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-400">Error: {error}</p>
      </div>
    );
  }

  if (payload == null) {
    return (
      <div className="p-6">
        <p className="text-slate-400">No data available.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-white p-4 dark:bg-slate-950 sm:p-6">
      <OmegaInverseHeader stats={payload.stats} />

      <div className="flex flex-col gap-6">
        <OmegaInverseGates stats={payload.stats} />

        <OmegaInverseTodayPanel
          liveExecutions={payload.liveExecutions}
          shadowSignals={payload.shadowSignals}
          omegaDirection={payload.omegaDirection}
          validUntil={payload.validUntil}
        />

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">
            Live executions
          </h2>
          <OmegaInverseHistoryTable liveExecutions={payload.liveExecutions} />
        </section>

        <OmegaInverseShadowTable shadowSignals={payload.shadowSignals} />
      </div>
    </div>
  );
}
