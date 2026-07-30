/**
 * Weekday entry pipeline: detect with retries for OANDA M5 lag, then enter once.
 * Cron target: 12:01 UTC (11:55 bar complete at 12:00; short buffer + retries).
 */

import { runPdlSweepDetection } from '../pdlSweepDetector/pdlSweepDetectorService.js';
import { isFreshPdlDetection } from '../pdlSweepDetector/pdlDetectionFreshness.js';
import { getSupabaseClient } from '../../connectors/supabase.js';
import {
  PDL_SWEEP_PAIR,
  PDL_SWEEP_TABLE,
} from '../pdlSweepDetector/pdlSweepConstants.js';
import { PdlWindowEngine } from './PdlWindowEngine.js';

const MAX_DETECT_ATTEMPTS = 5;
const RETRY_DELAY_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayUtcString(): string {
  return new Date().toISOString().slice(0, 10);
}

async function todayHasFreshDetection(tradeDate: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient()
    .from(PDL_SWEEP_TABLE)
    .select('evaluated_at')
    .eq('pair', PDL_SWEEP_PAIR)
    .eq('trade_date', tradeDate)
    .maybeSingle();
  if (error) {
    console.error('[PdlSweep] freshness check failed:', error.message);
    return false;
  }
  return isFreshPdlDetection(tradeDate, data?.evaluated_at as string | null);
}

async function runDetectionWithRetries(tradeDate: string): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_DETECT_ATTEMPTS; attempt += 1) {
    console.log(`[PdlSweep] detect attempt ${attempt}/${MAX_DETECT_ATTEMPTS}`);
    const wrote = await runPdlSweepDetection();
    if (wrote || (await todayHasFreshDetection(tradeDate))) return true;
    if (attempt < MAX_DETECT_ATTEMPTS) {
      console.warn(`[PdlSweep] detect incomplete — retry in ${RETRY_DELAY_MS}ms`);
      await sleep(RETRY_DELAY_MS);
    }
  }
  return todayHasFreshDetection(tradeDate);
}

/** Detect (retry) then live entry if armed. Fail-closed if detection never fresh. */
export async function runPdlDetectThenEntry(): Promise<void> {
  const tradeDate = todayUtcString();
  const detected = await runDetectionWithRetries(tradeDate);
  if (!detected) {
    console.error(
      `[PdlSweep] detection not fresh after retries — skip entry ${tradeDate}`,
    );
    return;
  }
  await PdlWindowEngine.runEntryOnce();
}
