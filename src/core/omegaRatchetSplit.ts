import { computeRatchetLegsShared, type RatchetLeg } from './ratchetSplit.js';
import { OMEGA_T1_PIPS, OMEGA_T2_PIPS } from './omegaRatchetConstants.js';

export type { RatchetLeg };

export function computeRatchetLegs(
  totalUnits: number,
  entryPrice: number,
  direction: 'LONG' | 'SHORT',
  instrument: string,
): RatchetLeg[] {
  return computeRatchetLegsShared(totalUnits, entryPrice, direction, {
    t1Pips: OMEGA_T1_PIPS,
    t2Pips: OMEGA_T2_PIPS,
    instrument,
  });
}
