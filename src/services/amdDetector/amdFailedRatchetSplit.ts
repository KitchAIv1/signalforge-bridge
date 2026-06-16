export interface AmdRatchetLeg {
  legType: 'tp1' | 'tp2' | 'trail';
  units: number;
  takeProfitPrice: string | null;
}

const T1_PIPS = 3.5;
const T2_PIPS = 5.25;
const PIP_SIZE = 0.0001;

export function computeAmdFailedRatchetLegs(
  totalUnits: number,
  entryPrice: number,
  direction: 'long' | 'short',
): AmdRatchetLeg[] {
  const absUnits = Math.abs(totalUnits);
  const sign = totalUnits < 0 ? -1 : 1;

  const leg1Units = Math.floor(absUnits / 3);
  const leg2Units = Math.floor(absUnits / 3);
  const leg3Units = absUnits - leg1Units - leg2Units;

  const tp1Price = direction === 'long'
    ? entryPrice + T1_PIPS * PIP_SIZE
    : entryPrice - T1_PIPS * PIP_SIZE;
  const tp2Price = direction === 'long'
    ? entryPrice + T2_PIPS * PIP_SIZE
    : entryPrice - T2_PIPS * PIP_SIZE;

  return [
    { legType: 'tp1', units: sign * leg1Units, takeProfitPrice: tp1Price.toFixed(5) },
    { legType: 'tp2', units: sign * leg2Units, takeProfitPrice: tp2Price.toFixed(5) },
    { legType: 'trail', units: sign * leg3Units, takeProfitPrice: null },
  ];
}
