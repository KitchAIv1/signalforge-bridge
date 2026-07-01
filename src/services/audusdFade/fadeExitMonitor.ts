/** Exit monitor delegates to multi-broker handler. */

import { runFadeExitForAllBrokers } from './fadeMultiBrokerExit.js';
import type { FadeConfig } from './fadeTypes.js';

export async function runExitMonitor(cfg: FadeConfig): Promise<void> {
  if (process.env.AUDUSD_FADE_ENABLED !== 'true') return;
  await runFadeExitForAllBrokers(cfg);
}
