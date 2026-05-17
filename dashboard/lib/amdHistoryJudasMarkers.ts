import type { SeriesMarker, Time } from 'lightweight-charts';
import type { RawAmdOhlcBar } from '@/lib/parseAmdChartOhlc';
import { inferJudasCandleUtcSec } from '@/lib/inferJudasCandleUtcSec';

export function judasMarkersForBars(
  rawBars: RawAmdOhlcBar[],
  tradeDate: string,
  judasDirection: 'UP' | 'DOWN' | 'FLAT' | null,
  judasExtremePrice?: number | null
): SeriesMarker<Time>[] {
  const judasSec = inferJudasCandleUtcSec(
    rawBars,
    tradeDate,
    judasDirection,
    judasExtremePrice
  );
  if (judasSec == null) return [];

  const color =
    judasDirection === 'UP'
      ? '#f472b6'
      : judasDirection === 'DOWN'
        ? '#38bdf8'
        : '#c4b5fd';

  return [
    {
      time: judasSec as Time,
      position: judasDirection === 'DOWN' ? 'belowBar' : 'aboveBar',
      shape: judasDirection === 'DOWN' ? 'arrowDown' : judasDirection === 'UP' ? 'arrowUp' : 'square',
      color,
      size: 2,
      text: 'Judas',
    },
  ];
}
