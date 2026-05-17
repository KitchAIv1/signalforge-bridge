'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { CandlestickData, UTCTimestamp } from 'lightweight-charts';
import type { AmdState } from '@/lib/types';
import { captureAmdChartPngBlob } from '@/lib/captureAmdChartPngBlob';
import { parseAmdChartOhlc } from '@/lib/parseAmdChartOhlc';
import type { RawAmdOhlcBar } from '@/lib/parseAmdChartOhlc';
import { uploadAmdChartToStorage } from '@/lib/uploadAmdChartToStorage';
import { updateAmdChartUrl } from '@/lib/updateAmdChartUrl';
import { utcSessionBandsForTradeDate } from '@/lib/amdHistorySessionUtcBands';
import { createUtcSessionBandsPrimitive } from '@/lib/amdHistoryUtcBandsPrimitive';
import { judasMarkersForBars } from '@/lib/amdHistoryJudasMarkers';
import { amdTagColor, amdTagLabel, judasDirectionLabel } from '@/lib/amdPanelFormatters';

interface AmdHistoryChartProps {
  amdState: AmdState;
}

type ChartSaveRibbonStatus = 'idle' | 'saving' | 'saved' | 'error';

function rawBarsToCandlestickData(rows: RawAmdOhlcBar[]): CandlestickData[] {
  return rows.map((bar) => ({
    time: Math.floor(Date.parse(bar.time) / 1000) as UTCTimestamp,
    open: parseFloat(bar.o),
    high: parseFloat(bar.h),
    low: parseFloat(bar.l),
    close: parseFloat(bar.c),
  }));
}

interface AmdHistoryChartSaveRibbonProps {
  savedUrlFlag: boolean;
  saveStatus: ChartSaveRibbonStatus;
  disableSaveChart: boolean;
  onPersistChartSnapshot: () => void;
}

function AmdHistoryChartSaveRibbon({
  savedUrlFlag,
  saveStatus,
  disableSaveChart,
  onPersistChartSnapshot,
}: AmdHistoryChartSaveRibbonProps) {
  if (savedUrlFlag) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 dark:border-slate-600">
        <span className="text-xs font-medium text-emerald-400">✓ Chart saved</span>
        <span className="text-[10px] text-slate-500">AUDUSD H1 — stored PNG + live AMD view below</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 dark:border-slate-600">
      <span className="text-xs text-slate-400">AUDUSD H1 — AMD annotated chart</span>
      <div className="flex items-center gap-2">
        {saveStatus === 'idle' || saveStatus === 'saved' || saveStatus === 'error' ? (
          <button
            type="button"
            disabled={disableSaveChart}
            onClick={() => onPersistChartSnapshot()}
            className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save chart
          </button>
        ) : null}
        {saveStatus === 'saving' ? <span className="text-[11px] text-slate-400">Saving…</span> : null}
        {saveStatus === 'error' ? (
          <span className="text-[11px] text-red-400">Could not save — try again</span>
        ) : null}
      </div>
    </div>
  );
}

function AmdHistorySessionLegend(): ReactElement {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      <span className="flex items-center gap-1">
        <span className="inline-block h-2 w-4 rounded bg-yellow-500/30" />
        Asian 00:00–08:00 UTC
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2 w-4 rounded bg-orange-500/30" />
        London 08:00–10:00 UTC (Judas window)
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2 w-4 rounded bg-green-500/30" />
        Distribution 10:00–16:00 UTC
      </span>
    </div>
  );
}

interface AmdHistoryStatsGridProps {
  amdState: AmdState;
  asianRangeLabel: string;
  asianSuffix: string;
}

function AmdHistoryStatsGrid({ amdState, asianRangeLabel, asianSuffix }: AmdHistoryStatsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
      <div className="rounded border border-slate-700 bg-slate-800/50 px-3 py-2">
        <p className="text-slate-400">Judas</p>
        <p className="font-medium text-white">
          {judasDirectionLabel(amdState.judas_direction)}
          {amdState.judas_pips != null ? ` (${amdState.judas_pips}p)` : ''}
        </p>
      </div>
      <div className="rounded border border-slate-700 bg-slate-800/50 px-3 py-2">
        <p className="text-slate-400">Reversal</p>
        <p
          className={
            amdState.reversal_confirmed === true
              ? 'font-medium text-green-400'
              : amdState.reversal_confirmed === false
                ? 'font-medium text-red-400'
                : 'font-medium text-slate-400'
          }
        >
          {amdState.reversal_confirmed === true
            ? 'Confirmed ✓'
            : amdState.reversal_confirmed === false
              ? 'Not confirmed'
              : '—'}
        </p>
      </div>
      <div className="rounded border border-slate-700 bg-slate-800/50 px-3 py-2">
        <p className="text-slate-400">Asian range</p>
        <p className="font-medium text-white">
          {asianRangeLabel}
          {asianSuffix ? ` ${asianSuffix}` : ''}
        </p>
      </div>
      <div className="rounded border border-slate-700 bg-slate-800/50 px-3 py-2">
        <p className="text-slate-400">Tag</p>
        <p className={`font-medium ${amdTagColor(amdState.amd_tag)}`}>{amdTagLabel(amdState.amd_tag)}</p>
      </div>
    </div>
  );
}

async function runPersistChartSnapshot(opts: {
  hostEl: HTMLDivElement;
  rawBars: RawAmdOhlcBar[];
  tradeDate: string;
  amdRowId: string;
  onRemountCharts: () => void;
  setSaving: () => void;
  setError: () => void;
  setSavedSuccess: (url: string) => void;
}): Promise<void> {
  const {
    hostEl,
    rawBars,
    tradeDate,
    amdRowId,
    onRemountCharts,
    setSaving,
    setError,
    setSavedSuccess,
  } = opts;
  try {
    setSaving();
    const pngBlob = await captureAmdChartPngBlob(hostEl, rawBars);
    if (!pngBlob) {
      setError();
      return;
    }
    const publicChartUrl = await uploadAmdChartToStorage(tradeDate, pngBlob);
    if (!publicChartUrl) {
      setError();
      return;
    }
    await updateAmdChartUrl(amdRowId, publicChartUrl);
    setSavedSuccess(publicChartUrl);
  } catch (err: unknown) {
    console.warn('[AmdHistoryChart] Save failed:', err);
    setError();
  } finally {
    onRemountCharts();
  }
}

export function AmdHistoryChart({ amdState }: AmdHistoryChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [saveStatus, setSaveStatus] = useState<ChartSaveRibbonStatus>('idle');
  const [savedChartUrlLocal, setSavedChartUrlLocal] = useState<string | null>(amdState.chart_url ?? null);
  const [chartRemountNonce, setChartRemountNonce] = useState(0);

  useEffect(() => {
    setSavedChartUrlLocal(amdState.chart_url ?? null);
    setSaveStatus('idle');
  }, [amdState.id, amdState.chart_url]);

  const rawBars = useMemo(
    () => parseAmdChartOhlc(amdState.chart_data),
    [amdState.chart_data, amdState.id]
  );

  useEffect(() => {
    const elRef = containerRef.current;
    if (!elRef || rawBars.length === 0) return undefined;

    const elHost = elRef;
    let chartInstance = null as null | ReturnType<
      typeof import('lightweight-charts').createChart
    >;
    let detachResizeHandlers: () => void = () => {};
    let cancelledEarly = false;

    void import('lightweight-charts').then((lw) => {
      if (cancelledEarly || containerRef.current !== elHost) return;

      elHost.innerHTML = '';
      const chartCanvas = lw.createChart(elHost, {
        width: elHost.clientWidth || 700,
        height: 320,
        layout: {
          background: { color: '#0f172a' },
          textColor: '#94a3b8',
        },
        grid: {
          vertLines: { color: '#1e293b' },
          horzLines: { color: '#1e293b' },
        },
        crosshair: { mode: lw.CrosshairMode.Normal },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          borderColor: '#334155',
        },
        rightPriceScale: { borderColor: '#334155' },
      });

      chartInstance = chartCanvas;

      const series = chartCanvas.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      });

      series.attachPrimitive(createUtcSessionBandsPrimitive(utcSessionBandsForTradeDate(amdState.trade_date)));

      const chartBars = rawBarsToCandlestickData(rawBars);
      series.setData(chartBars);

      series.setMarkers(judasMarkersForBars(rawBars, amdState.trade_date, amdState.judas_direction));

      chartCanvas.timeScale().fitContent();

      const resize = (): void =>
        chartInstance?.applyOptions({ width: containerRef.current?.clientWidth ?? 700 });

      resize();
      window.addEventListener('resize', resize);

      let observer: ResizeObserver | undefined;
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(resize);
        observer.observe(elHost);
      }

      detachResizeHandlers = (): void => {
        window.removeEventListener('resize', resize);
        observer?.disconnect();
      };
    });

    return () => {
      cancelledEarly = true;
      detachResizeHandlers();
      chartInstance?.remove();
      chartInstance = null;
      elHost.innerHTML = '';
    };
  }, [amdState.id, amdState.trade_date, amdState.judas_direction, rawBars, chartRemountNonce]);

  function startPersistFromClick(): void {
    if (saveStatus === 'saving' || savedChartUrlLocal != null) return;
    const hostEl = containerRef.current;
    if (!hostEl) {
      setSaveStatus('error');
      return;
    }
    void runPersistChartSnapshot({
      hostEl,
      rawBars,
      tradeDate: amdState.trade_date,
      amdRowId: amdState.id,
      onRemountCharts: () => setChartRemountNonce((n) => n + 1),
      setSaving: () => setSaveStatus('saving'),
      setError: () => setSaveStatus('error'),
      setSavedSuccess: (url) => {
        setSavedChartUrlLocal(url);
        setSaveStatus('saved');
      },
    });
  }

  if (rawBars.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-slate-700 bg-slate-900">
        <p className="text-sm text-slate-500">No candle data stored for this date</p>
      </div>
    );
  }

  const asianSuffix =
    amdState.asian_is_flat === true ? '(flat)' : amdState.asian_is_flat === false ? '(drift)' : '';
  const asianRangeLabel =
    amdState.asian_range_pips != null ? `${amdState.asian_range_pips} pips` : '—';
  const hasPersistedUrl = savedChartUrlLocal != null;

  return (
    <div className="space-y-2">
      <AmdHistoryChartSaveRibbon
        savedUrlFlag={hasPersistedUrl}
        saveStatus={saveStatus}
        disableSaveChart={saveStatus === 'saving'}
        onPersistChartSnapshot={startPersistFromClick}
      />

      {savedChartUrlLocal != null ? (
        <div className="overflow-hidden rounded-lg border border-slate-700">
          <img src={savedChartUrlLocal} alt={`AUDUSD H1 AMD chart ${amdState.trade_date}`} className="w-full" />
        </div>
      ) : null}

      <AmdHistorySessionLegend />

      <div
        ref={containerRef}
        className="w-full overflow-hidden rounded-lg"
        style={{ height: 320, background: '#0f172a' }}
      />

      <AmdHistoryStatsGrid amdState={amdState} asianRangeLabel={asianRangeLabel} asianSuffix={asianSuffix} />
    </div>
  );
}
