'use client';

import { useEffect, useRef } from 'react';

const TV_SCRIPT_URL = 'https://s3.tradingview.com/tv.js';
const TV_SCRIPT_DATA_ATTR = 'data-audusd-tv-embed';

export interface AUDUSDChartProps {
  symbol?: string;
  interval?: string;
  height?: number;
}

declare global {
  interface Window {
    TradingView: any;
  }
}

function ensureTradingViewScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }
    if (window.TradingView?.widget) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[${TV_SCRIPT_DATA_ATTR}="true"]`
    );
    if (existing) {
      const onReady = () => {
        if (window.TradingView?.widget) resolve();
        else reject(new Error('TradingView.widget not available after script load'));
      };
      if (window.TradingView?.widget) {
        onReady();
        return;
      }
      existing.addEventListener('load', onReady, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = TV_SCRIPT_URL;
    script.async = true;
    script.setAttribute(TV_SCRIPT_DATA_ATTR, 'true');
    script.onload = () => {
      if (window.TradingView?.widget) resolve();
      else reject(new Error('TradingView.widget not available after script load'));
    };
    script.onerror = () => reject(new Error('Failed to load TradingView script'));
    document.head.appendChild(script);
  });
}

function removeOurTradingViewScript(): void {
  document.querySelector<HTMLScriptElement>(`script[${TV_SCRIPT_DATA_ATTR}="true"]`)?.remove();
}

export function AUDUSDChart({
  symbol = 'OANDA:AUDUSD',
  interval = '5',
  height = 400,
}: AUDUSDChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<{ remove?: () => void } | null>(null);
  const containerId = `tv_chart_${(symbol).replace(/[^a-z0-9]/gi, '_')}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureTradingViewScript();
        if (cancelled || !containerRef.current) return;
        if (!window.TradingView?.widget) return;
        const widget = new window.TradingView.widget({
          autosize: true,
          symbol,
          interval,
          timezone: 'UTC',
          theme: 'light',
          style: '1',
          locale: 'en',
          toolbar_bg: '#f1f3f6',
          enable_publishing: false,
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: false,
          container_id: containerId,
        });
        if (cancelled) {
          if (typeof widget.remove === 'function') widget.remove();
          return;
        }
        widgetRef.current = widget;
      } catch {
        /* TradingView load/init errors are non-fatal for layout */
      }
    })();
    return () => {
      cancelled = true;
      if (widgetRef.current && typeof widgetRef.current.remove === 'function') {
        widgetRef.current.remove();
      }
      widgetRef.current = null;
      const el = document.getElementById(containerId);
      if (el) el.innerHTML = '';
      removeOurTradingViewScript();
    };
  }, [symbol, interval, height, containerId]);

  return (
    <div className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
        <span className="text-sm font-semibold text-slate-900">
          {symbol.replace('OANDA:', '')} · M{interval}
        </span>
        <span className="text-xs text-slate-400">TradingView</span>
      </div>
      <div
        ref={containerRef}
        id={containerId}
        className="w-full"
        style={{ height }}
      />
    </div>
  );
}

