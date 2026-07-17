/**
 * PDL Window engine orchestrator.
 * Entry after shadow detection; exit poll + 15:00 hard flatten.
 * Does not call into audusd_fade modules.
 */

import { isPdlWindowEnabled } from './pdlWindowConstants.js';
import { runPdlWindowEntryForAllBrokers } from './pdlWindowMultiBrokerEntry.js';
import {
  hardFlattenAllPdlTrades,
  runPdlWindowExitForAllBrokers,
} from './pdlWindowMultiBrokerExit.js';

export class PdlWindowEngine {
  static async runEntryOnce(): Promise<void> {
    if (!isPdlWindowEnabled()) return;
    try {
      await runPdlWindowEntryForAllBrokers();
    } catch (err) {
      console.error('[PdlWindow] Entry error:', err);
    }
  }

  static async runMonitors(): Promise<void> {
    if (!isPdlWindowEnabled()) return;
    try {
      await runPdlWindowExitForAllBrokers();
    } catch (err) {
      console.error('[PdlWindow] Monitor error:', err);
    }
  }

  static async hardFlatten1500(): Promise<void> {
    if (!isPdlWindowEnabled()) return;
    try {
      await hardFlattenAllPdlTrades();
      console.log('[PdlWindow] 15:00 hard flatten complete');
    } catch (err) {
      console.error('[PdlWindow] HardFlatten error:', err);
    }
  }
}
