/**
 * Same-currency exposure: count open positions by currency direction; block if over max.
 */

export function countSameCurrencyExposure(
  openPositions: Array<{ pair: string; units: number }>,
  newPair: string,
  newUnits: number,
  maxCorrelated: number
): { overLimit: boolean; count: number } {
  const newBase = newPair.slice(0, 3);
  const newQuote = newPair.slice(4, 7);
  const newDirection = newUnits > 0 ? 'long' : 'short';
  const newBaseDir = newDirection === 'long' ? 'long' : 'short';
  const newQuoteDir = newDirection === 'long' ? 'short' : 'long';

  let baseCount = 0;
  let quoteCount = 0;
  for (const pos of openPositions) {
    const base = pos.pair.slice(0, 3);
    const quote = pos.pair.slice(4, 7);
    const dir = pos.units > 0 ? 'long' : 'short';
    if (base === newBase && dir === newBaseDir) baseCount += 1;
    if (quote === newQuote && dir !== newQuoteDir) quoteCount += 1;
  }
  if (newDirection === 'long') baseCount += 1;
  else quoteCount += 1;

  const count = Math.max(baseCount, quoteCount);
  return { overLimit: count > maxCorrelated, count };
}
