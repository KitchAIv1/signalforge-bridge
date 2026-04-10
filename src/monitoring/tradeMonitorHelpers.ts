export function pipSize(pair: string | null): number {
  if (!pair) return 0.0001;
  return pair.includes('JPY') ? 0.01 : 0.0001;
}

export function resultFromPnl(pnlDollars: number | null): 'win' | 'loss' | 'breakeven' {
  if (pnlDollars == null) return 'breakeven';
  if (pnlDollars > 0) return 'win';
  if (pnlDollars < 0) return 'loss';
  return 'breakeven';
}

export function computeDerivedFields(
  row: Record<string, unknown>,
  exitPrice: number | null,
  pnlDollars: number | null
): Record<string, unknown> {
  const fillPrice = row.fill_price != null ? Number(row.fill_price) : null;
  const stopLoss = row.stop_loss != null ? Number(row.stop_loss) : null;
  const units = row.units != null ? Math.abs(Number(row.units)) : null;
  const entryPrice = row.entry_price != null ? Number(row.entry_price) : null;
  const pair = (row.pair as string) ?? null;
  const pip = pipSize(pair);

  if (fillPrice == null || exitPrice == null || stopLoss == null || units == null || pip === 0) {
    return {};
  }

  const pnlPips = (exitPrice - fillPrice) / pip;
  const signedPnlPips = Math.round(pnlPips * 10) / 10;

  const slDistancePips = Math.abs(fillPrice - stopLoss) / pip;
  const riskAmount = slDistancePips * pip * units;
  const pnlR =
    riskAmount > 0 && pnlDollars != null
      ? Math.round((pnlDollars / riskAmount) * 100) / 100
      : null;

  const slippagePips =
    entryPrice != null ? Math.round((Math.abs(fillPrice - entryPrice) / pip) * 10) / 10 : null;

  const lotSize = Math.round((units / 100000) * 10000) / 10000;

  return {
    pnl_pips: signedPnlPips,
    pnl_r: pnlR,
    slippage_pips: slippagePips,
    lot_size: lotSize,
    risk_amount: riskAmount > 0 ? Math.round(riskAmount * 100) / 100 : null,
  };
}
