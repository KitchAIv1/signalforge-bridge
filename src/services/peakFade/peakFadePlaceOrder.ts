/** Place Peak Fade market order (TP only) and persist open row. */

import type { EngineBrokerRoute } from '../broker/brokerLinkService.js';
import { PEAK_FADE_PIP_SIZE } from './peakFadeConstants.js';
import { peakFadeError } from './peakFadeLogger.js';
import { recordPeakFadeOpen } from './peakFadeRecordOpen.js';
import { sizePeakFadeUnits } from './peakFadeSizer.js';
import { submitPeakFadeOrder } from './peakFadeSubmitOrder.js';
import type { PeakFadeConfig, PeakFadeSetup } from './peakFadeTypes.js';

export function tpPriceFromFill(
  direction: PeakFadeSetup['direction'],
  fillPrice: number,
  targetPips: number,
): number {
  const offset = targetPips * PEAK_FADE_PIP_SIZE;
  return direction === 'long' ? fillPrice + offset : fillPrice - offset;
}

async function readRouteEquity(route: EngineBrokerRoute): Promise<number | null> {
  try {
    return (await route.broker.getAccountSummary()).equity;
  } catch (err) {
    peakFadeError('getAccountSummary failed', {
      brokerId: route.brokerId,
      error: String(err),
    });
    return null;
  }
}

export async function placeAndRecordPeakFadeOpen(
  cfg: PeakFadeConfig,
  setup: PeakFadeSetup,
  route: EngineBrokerRoute,
  tradeDate: string,
): Promise<void> {
  const { broker, brokerId, capitalAllocationPct } = route;
  const equity = await readRouteEquity(route);
  if (equity == null) return;
  const units = sizePeakFadeUnits({
    equity,
    engineWeight: cfg.engineWeight,
    riskPct: cfg.riskPct,
    riskRefPips: cfg.riskRefPips,
    capitalAllocationPct,
  });
  if (units <= 0) return;
  const fill = await submitPeakFadeOrder(
    broker,
    brokerId,
    cfg.pair,
    setup.direction === 'long' ? units : -units,
    setup.tp.toFixed(5),
  );
  if (!fill) return;
  await recordPeakFadeOpen({
    cfg,
    setup,
    broker,
    brokerId,
    tradeDate,
    tradeId: fill.tradeId,
    fillPrice: fill.fillPrice,
    units,
    tpFromFill: tpPriceFromFill(setup.direction, fill.fillPrice, cfg.targetPips),
  });
}
