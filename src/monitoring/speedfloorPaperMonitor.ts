/**
 * SPEEDFLOOR semi-live paper closer — pending BLOCKED floor rows only.
 * Isolated from live AO hard-stop / Shadow AO. Never places broker orders.
 */

import { getSupabaseClient } from '../connectors/supabase.js';
import { processOpenSpeedfloorPapers } from '../core/alphaOmega/speedfloorPaper/processOpenSpeedfloorPapers.js';
import { logWarn } from '../utils/logger.js';

export async function runSpeedfloorPaperMonitor(): Promise<void> {
  const supabase = getSupabaseClient();
  try {
    await processOpenSpeedfloorPapers(supabase, { limit: 200 });
  } catch (err) {
    logWarn('[SpeedfloorPaper] monitor cycle failed', { error: String(err) });
  }
}
