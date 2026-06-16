export interface RatchetLeg {
  legType: 'tp1' | 'tp2' | 'trail';
  units: number;
  takeProfitPrice: string | null;
}

const T1_PIPS = 6;
const T2_PIPS = 8;

function getPipSize(instrument: string): number {
  return instrument.includes('JPY') ? 0.01 : 0.0001;
}

export function computeRatchetLegs(
  totalUnits: number,
  entryPrice: number,
  direction: 'LONG' | 'SHORT',
  instrument: string,
): RatchetLeg[] {
  const absUnits = Math.abs(totalUnits);
  const sign = totalUnits < 0 ? -1 : 1;
  const pip = getPipSize(instrument);

  const leg1Units = Math.floor(absUnits / 3);
  const leg2Units = Math.floor(absUnits / 3);
  const leg3Units = absUnits - leg1Units - leg2Units;

  const tp1Price = direction === 'LONG'
    ? entryPrice + T1_PIPS * pip
    : entryPrice - T1_PIPS * pip;
  const tp2Price = direction === 'LONG'
    ? entryPrice + T2_PIPS * pip
    : entryPrice - T2_PIPS * pip;

  return [
    { legType: 'tp1', units: sign * leg1Units, takeProfitPrice: tp1Price.toFixed(5) },
    { legType: 'tp2', units: sign * leg2Units, takeProfitPrice: tp2Price.toFixed(5) },
    { legType: 'trail', units: sign * leg3Units, takeProfitPrice: null },
  ];
}
