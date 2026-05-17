import type { CandlestickData, UTCTimestamp } from 'lightweight-charts';
import type { RawAmdOhlcBar } from '@/lib/parseAmdChartOhlc';

function rowsToLwCandles(rows: RawAmdOhlcBar[]): CandlestickData[] {
  return rows.map((bar) => ({
    time: Math.floor(new Date(bar.time).getTime() / 1000) as UTCTimestamp,
    open: parseFloat(bar.o),
    high: parseFloat(bar.h),
    low: parseFloat(bar.l),
    close: parseFloat(bar.c),
  }));
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, ms));
}

type LwLoaded = typeof import('lightweight-charts');

async function paintCandlesOnHost(
  hostEl: HTMLDivElement,
  candlesticks: CandlestickData[]
): Promise<{ removeChart: () => void }> {
  const lw: LwLoaded = await import('lightweight-charts');
  hostEl.innerHTML = '';

  const chart = lw.createChart(hostEl, {
    width: hostEl.clientWidth || 600,
    height: 280,
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

  const series = chart.addCandlestickSeries({
    upColor: '#22c55e',
    downColor: '#ef4444',
    borderUpColor: '#22c55e',
    borderDownColor: '#ef4444',
    wickUpColor: '#22c55e',
    wickDownColor: '#ef4444',
  });

  series.setData(candlesticks);
  chart.timeScale().fitContent();

  return { removeChart: () => chart.remove() };
}

async function blobFromDomSnapshot(hostEl: HTMLDivElement): Promise<Blob | null> {
  const html2canvas = (await import('html2canvas')).default;

  const canvas = await html2canvas(hostEl, {
    backgroundColor: '#0f172a',
    scale: 1,
    useCORS: true,
    logging: false,
  });

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/** Renders H1 candles in a disposable chart and captures the host DOM as PNG. */
export async function captureAmdChartPngBlob(
  hostEl: HTMLDivElement,
  rawRows: RawAmdOhlcBar[]
): Promise<Blob | null> {
  const candlesticks = rowsToLwCandles(rawRows);
  const chartSession = await paintCandlesOnHost(hostEl, candlesticks);

  try {
    await sleepMs(800);
    return await blobFromDomSnapshot(hostEl);
  } finally {
    chartSession.removeChart();
  }
}
