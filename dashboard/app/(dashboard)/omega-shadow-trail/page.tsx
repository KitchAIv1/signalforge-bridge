'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchShadowTrailData } from '@/lib/fetchShadowTrailData';
import type { ShadowTrailPayload } from '@/lib/shadowTrailTypes';
import { ShadowTrailCompareTable } from '@/components/shadowTrail/ShadowTrailCompareTable';
import { ShadowTrailSlLegend } from '@/components/shadowTrail/ShadowTrailSlLegend';
import { ShadowTrailSummaryCards } from '@/components/shadowTrail/ShadowTrailSummaryCards';

const POLL_MS = 30_000;

export default function OmegaShadowTrailPage() {
  const [payload, setPayload] = useState<ShadowTrailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPayload = useCallback(async () => {
    try {
      setPayload(await fetchShadowTrailData(14));
      setError(null);
    } catch (loadErr: unknown) {
      setError(loadErr instanceof Error ? loadErr.message : String(loadErr));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPayload();
    const ticker = setInterval(() => void loadPayload(), POLL_MS);
    return () => clearInterval(ticker);
  }, [loadPayload]);

  if (loading) {
    return <p className="p-6 text-slate-400">Loading Shadow Trail v1...</p>;
  }
  if (error) {
    return <p className="p-6 text-red-400">Error: {error}</p>;
  }
  if (!payload) {
    return <p className="p-6 text-slate-400">No shadow trail data.</p>;
  }

  return (
    <div className="flex flex-col gap-6 bg-white p-4 dark:bg-slate-950 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Omega Shadow Trail v1
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Live Trail v1 vs shadow lanes — optimized SL SHORT 2.0R / LONG 3.0R, trail 0.5R.
        </p>
      </div>
      <ShadowTrailSlLegend />
      <ShadowTrailSummaryCards summary={payload.summary} />
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">
          Signal compare (last 14 days)
        </h2>
        <ShadowTrailCompareTable rows={payload.rows} />
      </section>
    </div>
  );
}
