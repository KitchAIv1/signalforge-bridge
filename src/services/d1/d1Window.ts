export function buildD1Window(tradeDate: string): { fromISO: string; toISO: string } {
  const dayStart = new Date(`${tradeDate}T00:00:00.000Z`);
  const nextDay = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  return {
    fromISO: `${tradeDate}T00:00:00.000000000Z`,
    toISO: `${nextDay.toISOString().split('T')[0]}T00:00:00.000000000Z`,
  };
}
