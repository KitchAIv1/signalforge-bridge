import type { UTCTimestamp } from 'lightweight-charts';

export interface UtcSessionBandDef {
  fromSec: UTCTimestamp;
  toSec: UTCTimestamp;
  fillCss: string;
}

function utcStartOfTradeDateUnixSec(tradeDate: string): number {
  return Math.floor(Date.parse(`${tradeDate}T00:00:00.000Z`) / 1000);
}

/** Asian / Judas London / Distribution windows aligned to amd_state.trade_date (UTC day). */
export function utcSessionBandsForTradeDate(tradeDate: string): UtcSessionBandDef[] {
  const day0 = utcStartOfTradeDateUnixSec(tradeDate);

  const asianFrom = day0 + 0 * 3600;
  const asianTo = day0 + 8 * 3600;
  const londonFrom = day0 + 8 * 3600;
  const londonTo = day0 + 10 * 3600;
  const distFrom = day0 + 10 * 3600;
  const distTo = day0 + 16 * 3600;

  return [
    { fromSec: asianFrom as UTCTimestamp, toSec: asianTo as UTCTimestamp, fillCss: 'rgba(234, 179, 8, 0.16)' },
    { fromSec: londonFrom as UTCTimestamp, toSec: londonTo as UTCTimestamp, fillCss: 'rgba(249, 115, 22, 0.16)' },
    { fromSec: distFrom as UTCTimestamp, toSec: distTo as UTCTimestamp, fillCss: 'rgba(34, 197, 94, 0.13)' },
  ];
}
