export function amdH1FetchWindow(tradeDay: string): { fromISO: string; toISO: string } {
  return {
    fromISO: `${tradeDay}T00:00:00.000000000Z`,
    toISO: `${tradeDay}T10:30:00.000000000Z`,
  };
}

export function amdM5FetchWindow(tradeDay: string): { fromISO: string; toISO: string } {
  return {
    fromISO: `${tradeDay}T10:00:00.000000000Z`,
    toISO: `${tradeDay}T10:30:00.000000000Z`,
  };
}

export function d1BiasFetchWindow(tradeDate: string): { fromISO: string; toISO: string } {
  const tradeDateMs = Date.parse(`${tradeDate}T00:00:00.000Z`);
  const rangeStartUtc = new Date(tradeDateMs - 21 * 24 * 3600 * 1000);
  const fromISO =
    rangeStartUtc.toISOString().split('T')[0] + 'T00:00:00.000000000Z';
  const toISO = `${tradeDate}T00:00:00.000000000Z`;
  return { fromISO, toISO };
}

export function decisionEvaluatedAtIso(tradeDate: string): string {
  return `${tradeDate}T10:31:00.000Z`;
}
