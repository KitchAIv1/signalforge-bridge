/** OANDA units ↔ MT5 lots (standard FX: 1 lot = 100,000 units). */

const UNITS_PER_LOT = 100_000;

export function unitsToMt5Lots(units: number): number {
  const absUnits = Math.abs(units);
  const lots = absUnits / UNITS_PER_LOT;
  const rounded = Math.round(lots * 100) / 100;
  return units < 0 ? -rounded : rounded;
}

export function mt5LotsToUnits(lots: number): number {
  const absLots = Math.abs(lots);
  const units = Math.round(absLots * UNITS_PER_LOT);
  return lots < 0 ? -units : units;
}

export function clampMt5Lots(lots: number, minLot: number, step: number): number {
  const sign = lots < 0 ? -1 : 1;
  const abs = Math.abs(lots);
  const stepped = Math.floor(abs / step) * step;
  const clamped = Math.max(minLot, stepped);
  return sign * clamped;
}
