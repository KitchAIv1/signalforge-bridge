export interface RawAmdOhlcBar {
  time: string;
  o: string;
  h: string;
  l: string;
  c: string;
}

function coerceNumString(rowValue: unknown): string | null {
  if (rowValue == null) return null;
  const asText = typeof rowValue === 'string' ? rowValue : String(rowValue);
  return Number.isFinite(parseFloat(asText)) ? asText : null;
}

/** Pulls validated OHLC rows from amd_state.chart_data.ohlc. */
export function parseAmdChartOhlc(
  chartData: Record<string, unknown> | null
): RawAmdOhlcBar[] {
  const raw = chartData?.ohlc;
  if (!Array.isArray(raw)) return [];

  const out: RawAmdOhlcBar[] = [];

  for (const rowUnknown of raw) {
    if (rowUnknown == null || typeof rowUnknown !== 'object') continue;
    const row = rowUnknown as Record<string, unknown>;
    const timeField = row.time;
    if (typeof timeField !== 'string') continue;

    const o = coerceNumString(row.o);
    const hVal = coerceNumString(row.h);
    const lowVal = coerceNumString(row.l);
    const closeVal = coerceNumString(row.c);
    if (!o || !hVal || !lowVal || !closeVal) continue;

    out.push({ time: timeField, o, h: hVal, l: lowVal, c: closeVal });
  }

  return out;
}
