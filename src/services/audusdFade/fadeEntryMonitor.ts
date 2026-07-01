/**
 * Entry monitor — every tick: fetch completed AUD/EUR M5, evaluate the EURUSD-gated
 * SMA50 fade setup, and place one bracketed OANDA practice market order when it fires.
 *
 * Guards: one open fade trade at a time, max trades/day cap, one-trade-per-M5-bar,
 * and units always sized from live account equity.
 */

import { runFadeEntryForAllBrokers } from './fadeMultiBrokerEntry.js';
import type { FadeConfig } from './fadeTypes.js';

export async function runEntryMonitor(cfg: FadeConfig): Promise<void> {
  if (process.env.AUDUSD_FADE_ENABLED !== 'true') return;
  await runFadeEntryForAllBrokers(cfg);
}
