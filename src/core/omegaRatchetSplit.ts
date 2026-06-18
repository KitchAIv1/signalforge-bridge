import { computeRatchetLegsShared, type RatchetLeg } from './ratchetSplit.js';

export type { RatchetLeg };

const T1_PIPS = 6;
const T2_PIPS = 8;

export function computeRatchetLegs(
  totalUnits: number,
  entryPrice: number,
  direction: 'LONG' | 'SHORT',
  instrument: string,
): RatchetLeg[] {
  return computeRatchetLegsShared(totalUnits, entryPrice, direction, {
    t1Pips: T1_PIPS,
    t2Pips: T2_PIPS,
    instrument,
  });
}
