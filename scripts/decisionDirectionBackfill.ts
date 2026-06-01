/**
 * Backfill decision_auto_direction on amd_state by reconstructing live 10:31 detection.
 *
 * CRITICAL: H1 candles with UTC hour >= 10 are excluded after fetch so distCandles
 * stays empty — matching what the engine saw at decision time.
 *
 * Run DRY_RUN first:
 *   DRY_RUN=true npx tsx scripts/decisionDirectionBackfill.ts
 *
 * Live write (only rows where decision_auto_direction IS NULL):
 *   npx tsx scripts/decisionDirectionBackfill.ts
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OANDA_API_TOKEN
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { runDecisionDirectionBackfill } from './decisionDirectionBackfill/runBackfill.js';

void runDecisionDirectionBackfill().catch((err: unknown) => {
  console.error('[DecisionBackfill] Fatal:', err);
  process.exit(1);
});
