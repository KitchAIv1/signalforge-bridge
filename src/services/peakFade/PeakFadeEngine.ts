/**
 * PeakFadeEngine — D1 extreme fade on AUDUSD, broker TP, no SL.
 *
 * Requires PEAK_FADE_ENABLED=true AND bridge_config peak_fade_enabled=true.
 * Bypasses signalRouter / Omega. Dual-book via bridge_links.
 */

import { isPeakFadeEnvEnabled } from './peakFadeConstants.js';
import { isPeakFadeConfigEnabled } from './peakFadeConfigGate.js';
import { runPeakFadeEntryForAllBrokers } from './peakFadeMultiBrokerEntry.js';
import { runPeakFadeExitForAllBrokers } from './peakFadeMultiBrokerExit.js';
import { runPeakFadeMaeWatch } from './peakFadeMaeWatch.js';
import { loadPeakFadeConfig } from './peakFadeTypes.js';

export async function runMonitors(): Promise<void> {
  if (!isPeakFadeEnvEnabled()) return;
  if (!(await isPeakFadeConfigEnabled())) return;
  const cfg = loadPeakFadeConfig();
  await runPeakFadeExitForAllBrokers(cfg);
  await runPeakFadeMaeWatch(cfg);
  await runPeakFadeEntryForAllBrokers(cfg);
}
