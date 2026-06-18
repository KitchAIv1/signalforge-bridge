export function buildD1Window(tradeDate: string): { fromISO: string; toISO: string } {
  const dayStart = new Date(`${tradeDate}T00:00:00.000Z`);
  const nextDay = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  return {
    fromISO: `${tradeDate}T00:00:00.000000000Z`,
    toISO: `${nextDay.toISOString().split('T')[0]}T00:00:00.000000000Z`,
  };
}

/** Safe OANDA window for latest complete D1 bar (21:00 UTC boundaries; to always in the past). */
export function buildLatestCompleteD1FetchWindow(): { fromISO: string; toISO: string } {
  return {
    fromISO: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
    toISO: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  };
}
