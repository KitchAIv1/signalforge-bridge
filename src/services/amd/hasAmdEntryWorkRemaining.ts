/**
 * Whether AMD still has at least one venue left to place today.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AMD_BROKER_ID } from './resolveAmdOandaAccountId.js';
import { AMD_VT_BROKER_ID, isAmdVtMirrorEnabled } from './amdVtMirror.js';
import { hasAmdVenueExecutedToday } from './amdVenueExecutedToday.js';

/**
 * Work remains if OANDA has not EXECUTED, or VT is enabled and has not EXECUTED.
 * When VT kill-switch is OFF, only the OANDA book gates the day.
 */
export async function hasAmdEntryWorkRemaining(
  supabase: SupabaseClient,
  todayStr: string,
): Promise<boolean> {
  const oandaDone = await hasAmdVenueExecutedToday(supabase, AMD_BROKER_ID, todayStr);
  if (!(await isAmdVtMirrorEnabled(supabase))) {
    return !oandaDone;
  }
  const vtDone = await hasAmdVenueExecutedToday(supabase, AMD_VT_BROKER_ID, todayStr);
  return !oandaDone || !vtDone;
}
