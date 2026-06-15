'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type IPriceLine,
  ColorType,
} from 'lightweight-charts';

interface OandaCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface TradeLine {
  price: number;
  label: string;
  color: string;
}

interface OverrideChartProps {
  tradeLines: TradeLine[];
}

type Timeframe = 'M5' | 'M15' | 'H1';

const TIMEFRAMES: Timeframe[] = ['M5', 'M15', 'H1'];

export function OverrideChart({ tradeLines }: OverrideChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLineRefs = useRef<IPriceLine[]>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>('M5');
  const [error, setError] = useState<string | null>(null);

  const fetchAndRender = useCallback(async (tf: Timeframe) => {
    try {
      const res = await fetch(`/api/override/candles?granularity=${tf}`);
      if (!res.ok) throw new Error(`Candles fetch failed: ${res.status}`);
      const data = await res.json() as { candles: OandaCandle[] };
      if (seriesRef.current) {
        seriesRef.current.setData(
          data.candles as CandlestickData[]
        );
      }
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.offsetWidth || 500,
      height: 280,
      layout: {
        background: { type: ColorType.Solid, color: '#0f172a' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      crosshair: {
        vertLine: { color: '#475569' },
        horzLine: { color: '#475569' },
      },
      rightPriceScale: {
        borderColor: '#1e293b',
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.offsetWidth,
        });
      }
    });
    resizeObserver.observe(containerRef.current);

    void fetchAndRender('M5');

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [fetchAndRender]);

  useEffect(() => {
    if (!seriesRef.current) return;

    // Remove existing price lines
    priceLineRefs.current.forEach(line => {
      seriesRef.current?.removePriceLine(line);
    });
    priceLineRefs.current = [];

    // Add new price lines
    tradeLines.forEach(line => {
      const priceLine = seriesRef.current?.createPriceLine({
        price: line.price,
        color: line.color,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: line.label,
      });
      if (priceLine) priceLineRefs.current.push(priceLine);
    });
  }, [tradeLines]);

  useEffect(() => {
    void fetchAndRender(timeframe);

    const interval = setInterval(() => {
      void fetchAndRender(timeframe);
    }, 10000);

    return () => clearInterval(interval);
  }, [timeframe, fetchAndRender]);

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <span className="text-xs font-medium text-slate-400">AUD/USD</span>
        <div className="flex gap-1">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                timeframe === tf
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 text-xs text-red-400">{error}</div>
      )}

      <div
        ref={containerRef}
        style={{ height: '280px' }}
      />
    </div>
  );
}
