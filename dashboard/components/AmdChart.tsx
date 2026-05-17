'use client';

import { useRef, useState } from 'react';
import type { AmdState } from '@/lib/types';
import { captureAmdChartPngBlob } from '@/lib/captureAmdChartPngBlob';
import { parseAmdChartOhlc } from '@/lib/parseAmdChartOhlc';
import { uploadAmdChartToStorage } from '@/lib/uploadAmdChartToStorage';
import { updateAmdChartUrl } from '@/lib/updateAmdChartUrl';

type ChartGenStatus = 'idle' | 'generating' | 'done' | 'error';

interface AmdChartProps {
  amdState: AmdState;
  onChartUrlSaved?: (url: string) => void;
}

export function AmdChart({ amdState, onChartUrlSaved }: AmdChartProps) {
  const plotHostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ChartGenStatus>('idle');
  const [savedChartUrl, setSavedChartUrl] = useState<string | null>(null);

  const displayUrl = amdState.chart_url ?? savedChartUrl;

  if (displayUrl) {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        <p className="bg-slate-50 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          AUDUSD H1 — AMD Session Chart
        </p>
        <img src={displayUrl} alt="AUDUSD H1 AMD chart" className="w-full" />
      </div>
    );
  }

  const ohlcRows = parseAmdChartOhlc(amdState.chart_data);

  if (ohlcRows.length === 0) {
    return (
      <p className="px-3 py-2 text-xs italic text-slate-500 dark:text-slate-400">
        Chart data not available for this day
      </p>
    );
  }

  async function handleGenerateChart(): Promise<void> {
    if (status !== 'idle' || !plotHostRef.current) return;

    const hostEl = plotHostRef.current;
    setStatus('generating');

    try {
      const pngBlob = await captureAmdChartPngBlob(hostEl, ohlcRows);

      if (!pngBlob) {
        setStatus('error');
        return;
      }

      const publicChartUrl = await uploadAmdChartToStorage(amdState.trade_date, pngBlob);

      if (!publicChartUrl) {
        setStatus('error');
        return;
      }

      await updateAmdChartUrl(amdState.id, publicChartUrl);
      setSavedChartUrl(publicChartUrl);
      onChartUrlSaved?.(publicChartUrl);
      setStatus('done');
    } catch (err: unknown) {
      console.warn('[AmdChart] Failed:', err);
      setStatus('error');
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between bg-slate-50 px-3 py-1 dark:bg-slate-800">
        <p className="text-xs text-slate-600 dark:text-slate-400">AUDUSD H1 — AMD Session Chart</p>
        {status === 'idle' && (
          <button
            type="button"
            onClick={() => void handleGenerateChart()}
            className="text-xs text-blue-600 transition-colors hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Generate chart
          </button>
        )}
        {status === 'generating' && (
          <span className="text-xs text-slate-500 dark:text-slate-400">Generating...</span>
        )}
        {status === 'error' && (
          <span className="text-xs text-red-500 dark:text-red-400">Failed — try reload</span>
        )}
      </div>
      <div
        ref={plotHostRef}
        className="w-full"
        style={{ minHeight: 280, background: '#0f172a' }}
      />
    </div>
  );
}
