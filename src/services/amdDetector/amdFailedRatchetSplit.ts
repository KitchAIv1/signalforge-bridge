import { computeRatchetLegsShared, type RatchetLeg } from '../../core/ratchetSplit.js';

export type { RatchetLeg as AmdRatchetLeg };

const T1_PIPS = 3.5;
const T2_PIPS = 5.25;
const INSTRUMENT = 'AUD_USD';

export function computeAmdFailedRatchetLegs(
  totalUnits: number,
  entryPrice: number,
  direction: 'long' | 'short',
): RatchetLeg[] {
  return computeRatchetLegsShared(totalUnits, entryPrice, direction, {
    t1Pips: T1_PIPS,
    t2Pips: T2_PIPS,
    instrument: INSTRUMENT,
  });
}
