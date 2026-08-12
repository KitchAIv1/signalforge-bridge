/**
 * Peak Fade multi-broker entry — evaluate once, fan-out to books missing a seat.
 * No broker SL; TP only. News blackout blocks new entries.
 */

import { getSupabaseClient } from '../../connectors/supabase.js';
import { loadExecutionRoutes, type EngineBrokerRoute } from '../broker/brokerLinkService.js';
import { PEAK_FADE_ENGINE_ID } from './peakFadeConstants.js';
import { buildD1BarsFromM5 } from './peakFadeD1.js';
import {
  loadOpenTradesForBroker,
  recentTradeOpenedForBroker,
} from './peakFadeDayState.js';
import { loadPeakFadeM5FromBroker, loadPeakFadeM5FromOanda } from './peakFadeCandleLoad.js';
import { peakFadeLog, peakFadeWarn } from './peakFadeLogger.js';
import { checkPeakFadeNewsBlackout } from './peakFadeNewsGate.js';
import { placeAndRecordPeakFadeOpen } from './peakFadePlaceOrder.js';
import { logPeakFadeIdleTick } from './peakFadeStatusLog.js';
import { evaluatePeakFadeSetup } from './peakFadeStrategy.js';
import type { PeakFadeConfig, PeakFadeSetup } from './peakFadeTypes.js';
import { todayUtcString } from './peakFadeTypes.js';

async function resolveSetup(cfg: PeakFadeConfig): Promise<PeakFadeSetup | null> {
  const routes = await loadExecutionRoutes(getSupabaseClient(), PEAK_FADE_ENGINE_ID);
  if (!routes.length) {
    peakFadeWarn('No active bridge_links for peak_fade');
    return null;
  }
  const oanda = routes.find((route) => route.broker.brokerType === 'oanda');
  const bars = oanda
    ? await loadPeakFadeM5FromOanda(cfg.pair)
    : await loadPeakFadeM5FromBroker(routes[0]!.broker, cfg.pair);
  if (bars.length < cfg.trendBars + 20) {
    peakFadeWarn('Insufficient M5 bars', { n: bars.length });
    return null;
  }
  return evaluatePeakFadeSetup(bars, buildD1BarsFromM5(bars), cfg);
}

async function routesNeedingEntry(
  cfg: PeakFadeConfig,
  routes: EngineBrokerRoute[],
): Promise<EngineBrokerRoute[]> {
  const needing: EngineBrokerRoute[] = [];
  for (const route of routes) {
    const openHere = await loadOpenTradesForBroker(cfg.pair, route.brokerId);
    if (openHere.length > 0) continue;
    if (await recentTradeOpenedForBroker(cfg.pair, route.brokerId)) continue;
    needing.push(route);
  }
  return needing;
}

export async function runPeakFadeEntryForAllBrokers(cfg: PeakFadeConfig): Promise<void> {
  const routes = await loadExecutionRoutes(getSupabaseClient(), PEAK_FADE_ENGINE_ID);
  if (!routes.length) {
    peakFadeWarn('No active bridge_links for peak_fade');
    return;
  }
  const needing = await routesNeedingEntry(cfg, routes);
  if (!needing.length) {
    logPeakFadeIdleTick('all linked books already seated or cool-down');
    return;
  }

  const news = await checkPeakFadeNewsBlackout(cfg, cfg.pair);
  if (news.blocked) {
    peakFadeLog('News blackout — skip entry', {
      eventName: news.eventName,
      eventAt: news.eventAt,
    });
    return;
  }

  const setup = await resolveSetup(cfg);
  if (!setup) {
    logPeakFadeIdleTick('no D1 extreme + push setup on last M5');
    return;
  }

  const tradeDate = todayUtcString();
  for (const route of needing) {
    await placeAndRecordPeakFadeOpen(cfg, setup, route, tradeDate);
  }
}
