/**
 * Manual run — resolve shadow Trail v1 for pending omega tp1 signals.
 *
 * Run: npx tsx scripts/runShadowTrailExitResolver.ts
 */

import 'dotenv/config';
import { getSupabaseClient } from '../src/connectors/supabase.js';
import { runShadowTrailExitResolver } from '../src/services/shadowTrailExit/shadowTrailExitService.js';

const supabase = getSupabaseClient();
void runShadowTrailExitResolver(supabase)
  .then(result => {
    console.log('[ShadowTrail] done', result);
  })
  .catch(err => {
    console.error('[ShadowTrail] fatal', err);
    process.exit(1);
  });
