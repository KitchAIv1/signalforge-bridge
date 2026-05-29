import type { JudasDirection } from '../../src/services/amdDetector/amdTypes.js';
import type { AsianExtremePrices } from './asianExtremes.js';

export type AsianBreachResult = {
  breachesAsianRange: boolean;
  judasInsideAsianBox: boolean;
};

export function evaluateAsianBreach(
  judasDirection: JudasDirection | null,
  judasExtremePrice: number | null,
  asianExtremes: AsianExtremePrices | null
): AsianBreachResult {
  if (
    asianExtremes == null ||
    judasExtremePrice == null ||
    judasDirection === null ||
    judasDirection === 'FLAT'
  ) {
    return { breachesAsianRange: false, judasInsideAsianBox: true };
  }
  const breaches =
    judasDirection === 'UP'
      ? judasExtremePrice > asianExtremes.asianHighPrice
      : judasExtremePrice < asianExtremes.asianLowPrice;
  return {
    breachesAsianRange: breaches,
    judasInsideAsianBox: !breaches,
  };
}
