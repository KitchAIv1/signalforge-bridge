export type D1Direction = 'long' | 'short' | 'equal';

export type OhlcPrices = {
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
};

export type D1ProfileMetrics = {
  netPips: number;
  rangePips: number;
  direction: D1Direction;
  closePositionPct: number;
  bodyPct: number;
  upperWickPct: number;
  lowerWickPct: number;
};

export function computeDirection(
  netPips: number,
  directionThresholdPips: number,
): D1Direction {
  if (netPips > directionThresholdPips) return 'long';
  if (netPips < -directionThresholdPips) return 'short';
  return 'equal';
}

export function computeD1ProfileMetrics(
  prices: OhlcPrices,
  directionThresholdPips: number,
): D1ProfileMetrics {
  const { openPrice, highPrice, lowPrice, closePrice } = prices;
  const netPips = Math.round((closePrice - openPrice) * 100000) / 10;
  const rangePips = Math.round((highPrice - lowPrice) * 100000) / 10;
  const direction = computeDirection(netPips, directionThresholdPips);

  const closePositionPct =
    rangePips > 0
      ? Math.round(((closePrice - lowPrice) / (highPrice - lowPrice)) * 1000) / 10
      : 50;

  const bodyPct =
    rangePips > 0
      ? Math.round((Math.abs(closePrice - openPrice) / (highPrice - lowPrice)) * 1000) / 10
      : 0;

  const bodyTop = Math.max(openPrice, closePrice);
  const bodyBottom = Math.min(openPrice, closePrice);
  const upperWickPct =
    rangePips > 0
      ? Math.round(((highPrice - bodyTop) / (highPrice - lowPrice)) * 1000) / 10
      : 0;
  const lowerWickPct =
    rangePips > 0
      ? Math.round(((bodyBottom - lowPrice) / (highPrice - lowPrice)) * 1000) / 10
      : 0;

  return {
    netPips,
    rangePips,
    direction,
    closePositionPct,
    bodyPct,
    upperWickPct,
    lowerWickPct,
  };
}
