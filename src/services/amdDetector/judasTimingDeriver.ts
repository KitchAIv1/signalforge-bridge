export type JudasTiming = 'EARLY' | 'LATE' | null;

type ChartOhlcRow = { time: string; h: unknown; l: unknown };

const JUDAS_MATCH_TOLERANCE = 0.0005;

export function deriveJudasTiming(
  chartData: unknown,
  judasDirection: string | null,
  judasExtremePrice: number | null,
): { hour: number | null; timing: JudasTiming } {
  if (!judasDirection || judasDirection === 'FLAT' || judasExtremePrice == null) {
    return { hour: null, timing: null };
  }
  const ohlc = (chartData as { ohlc?: ChartOhlcRow[] } | null)?.ohlc;
  if (!ohlc?.length) return { hour: null, timing: null };

  const londonBars = ohlc.filter((bar) => {
    const utcHour = new Date(bar.time).getUTCHours();
    return utcHour === 8 || utcHour === 9;
  });
  if (londonBars.length === 0) return { hour: null, timing: null };

  const useHigh = judasDirection === 'UP';
  let bestBar = londonBars[0];
  let bestDistance = Infinity;
  for (const bar of londonBars) {
    const extreme = parseFloat(String(useHigh ? bar.h : bar.l));
    const distance = Math.abs(extreme - judasExtremePrice);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestBar = bar;
    }
  }
  if (bestDistance > JUDAS_MATCH_TOLERANCE) return { hour: null, timing: null };

  const hour = new Date(bestBar.time).getUTCHours();
  if (hour !== 8 && hour !== 9) return { hour: null, timing: null };
  return { hour, timing: hour === 8 ? 'EARLY' : 'LATE' };
}
