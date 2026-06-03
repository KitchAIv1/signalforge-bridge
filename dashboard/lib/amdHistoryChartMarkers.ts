import type { SeriesMarker, Time } from 'lightweight-charts';
import type { AmdState } from '@/lib/types';
import type { RawAmdOhlcBar } from '@/lib/parseAmdChartOhlc';
import type { AmdTradeEntry } from '@/lib/fetchAmdTradeEntry';
import { judasMarkersForBars } from '@/lib/amdHistoryJudasMarkers';

function isoToUnixSec(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

function windowMarkerColor(confirmed: boolean | null | undefined): string {
  if (confirmed === true) return '#22c55e';
  if (confirmed === false) return '#ef4444';
  return '#6b7280';
}

function windowBoundaryMarkers(amdState: AmdState): SeriesMarker<Time>[] {
  if (!amdState.window_from_utc || !amdState.window_to_utc) return [];

  const windowColor = windowMarkerColor(amdState.window_direction_confirmed);
  const pipLabel =
    amdState.window_pip_move != null
      ? `+${amdState.window_pip_move}p`
      : '?';

  return [
    {
      time: isoToUnixSec(amdState.window_from_utc) as Time,
      position: 'inBar',
      color: windowColor,
      shape: 'square',
      size: 1,
      text: 'W start',
    },
    {
      time: isoToUnixSec(amdState.window_to_utc) as Time,
      position: 'inBar',
      color: windowColor,
      shape: 'square',
      size: 1,
      text: `W end ${pipLabel}`,
    },
  ];
}

function tradeEntryMarker(tradeEntry: AmdTradeEntry): SeriesMarker<Time> {
  const isLong = tradeEntry.direction === 'long';
  return {
    time: isoToUnixSec(tradeEntry.createdAt) as Time,
    position: isLong ? 'belowBar' : 'aboveBar',
    color: isLong ? '#22c55e' : '#ef4444',
    shape: isLong ? 'arrowUp' : 'arrowDown',
    size: 2,
    text: 'Entry',
  };
}

export function buildAmdHistoryChartMarkers(
  rawBars: RawAmdOhlcBar[],
  amdState: AmdState,
  tradeEntry: AmdTradeEntry | null | undefined,
): SeriesMarker<Time>[] {
  const judasMarkers = judasMarkersForBars(
    rawBars,
    amdState.trade_date,
    amdState.judas_direction,
    amdState.judas_extreme_price,
  );

  const windowMarkers = windowBoundaryMarkers(amdState);
  const entryMarkers = tradeEntry ? [tradeEntryMarker(tradeEntry)] : [];

  return [...judasMarkers, ...windowMarkers, ...entryMarkers];
}
