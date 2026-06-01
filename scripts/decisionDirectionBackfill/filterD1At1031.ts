/** Drop last D1 bar — prior-evening session incomplete at 10:31 UTC. */

export type D1FilterResult<T extends { time: string }> = {
  d1Candles: T[];
  d1BarsRaw: number;
  d1BarsUsed: number;
  d1LastDroppedTime: string | null;
};

export function filterD1CandlesAt1031<T extends { time: string }>(
  d1Raw: T[],
): D1FilterResult<T> {
  if (d1Raw.length === 0) {
    return {
      d1Candles: [],
      d1BarsRaw: 0,
      d1BarsUsed: 0,
      d1LastDroppedTime: null,
    };
  }

  const droppedBar = d1Raw[d1Raw.length - 1];
  return {
    d1Candles: d1Raw.slice(0, -1),
    d1BarsRaw: d1Raw.length,
    d1BarsUsed: d1Raw.length - 1,
    d1LastDroppedTime: droppedBar.time,
  };
}
