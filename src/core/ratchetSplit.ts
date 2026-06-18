/**
 * Shared ratchet split-exit utility.
 * Used by both Omega Prime (T1=6p/T2=8p) and AMD_FAILED (T1=3.5p/T2=5.25p).
 * T3 is always a trail leg — no broker TP, trail activates after marker pip.
 * FIFO safeguard: T2 always gets remainder unit so T1 ≠ T2 unit count,
 * preventing OANDA FIFO_VIOLATION_SAFEGUARD_VIOLATION on same-direction
 * legs with different TPs.
 */

export interface RatchetLeg {
  legType: 'tp1' | 'tp2' | 'trail';
  units: number;
  takeProfitPrice: string | null;
}

export interface RatchetConfig {
  t1Pips: number;
  t2Pips: number;
  instrument: string;
}

function getPipSize(instrument: string): number {
  return instrument.includes('JPY') ? 0.01 : 0.0001;
}

export function computeRatchetLegsShared(
  totalUnits: number,
  entryPrice: number,
  direction: 'long' | 'short' | 'LONG' | 'SHORT',
  config: RatchetConfig,
): RatchetLeg[] {
  const absUnits = Math.abs(totalUnits);
  const sign = totalUnits < 0 ? -1 : 1;
  const pip = getPipSize(config.instrument);
  const isLong = direction.toUpperCase() === 'LONG';

  const leg1Units = Math.floor(absUnits / 3);
  const leg3Units = Math.floor(absUnits / 3);
  const rawLeg2Units = absUnits - leg1Units - leg3Units;
  const leg2Units = rawLeg2Units === leg1Units ? rawLeg2Units + 1 : rawLeg2Units;
  const finalLeg3Units = absUnits - leg1Units - leg2Units;

  const tp1Price = isLong
    ? entryPrice + config.t1Pips * pip
    : entryPrice - config.t1Pips * pip;
  const tp2Price = isLong
    ? entryPrice + config.t2Pips * pip
    : entryPrice - config.t2Pips * pip;

  return [
    { legType: 'tp1', units: sign * leg1Units, takeProfitPrice: tp1Price.toFixed(5) },
    { legType: 'tp2', units: sign * leg2Units, takeProfitPrice: tp2Price.toFixed(5) },
    { legType: 'trail', units: sign * finalLeg3Units, takeProfitPrice: null },
  ];
}
