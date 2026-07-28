/**
 * AO Lane B entry blackout — [21:00, 21:15) UTC daily.
 * Place-path only; never gate streak observe or exits.
 */

import {
  ALPHAOMEGA_ENTRY_BLACKOUT_END_UTC_MIN,
  ALPHAOMEGA_ENTRY_BLACKOUT_START_UTC_MIN,
} from './alphaOmegaConstants.js';

/** True when UTC clock is inside the AO new-entry blackout window. */
export function isAlphaOmegaEntryBlackoutUtc(asOf: Date): boolean {
  const minutesOfDay = asOf.getUTCHours() * 60 + asOf.getUTCMinutes();
  return (
    minutesOfDay >= ALPHAOMEGA_ENTRY_BLACKOUT_START_UTC_MIN &&
    minutesOfDay < ALPHAOMEGA_ENTRY_BLACKOUT_END_UTC_MIN
  );
}
