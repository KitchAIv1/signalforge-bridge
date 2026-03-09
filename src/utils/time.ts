/**
 * Market hours (Sun 22:00 – Fri 22:00 UTC), weekend-close buffer (e.g. 30 min before Fri close).
 */

const FRIDAY_CLOSE_UTC_HOUR = 22;
const FRIDAY_CLOSE_UTC_MINUTE = 0;
const SUNDAY_OPEN_UTC_HOUR = 22;

export function isForexMarketOpen(now: Date = new Date(), bufferMinutes: number = 30): boolean {
  const utc = new Date(now.toISOString());
  const day = utc.getUTCDay();
  const hour = utc.getUTCHours();
  const minute = utc.getUTCMinutes();
  const totalMinutes = hour * 60 + minute;

  if (day === 0) {
    return hour >= SUNDAY_OPEN_UTC_HOUR;
  }
  if (day >= 1 && day <= 4) return true;
  if (day === 5) {
    const closeMinutes = FRIDAY_CLOSE_UTC_HOUR * 60 + FRIDAY_CLOSE_UTC_MINUTE;
    return totalMinutes < closeMinutes - bufferMinutes;
  }
  return false;
}

export function getMinutesUntilFridayClose(now: Date = new Date()): number {
  const utc = new Date(now.toISOString());
  const day = utc.getUTCDay();
  const hour = utc.getUTCHours();
  const minute = utc.getUTCMinutes();
  if (day !== 5) return Infinity;
  const closeMinutes = FRIDAY_CLOSE_UTC_HOUR * 60 + FRIDAY_CLOSE_UTC_MINUTE;
  const currentMinutes = hour * 60 + minute;
  return Math.max(0, closeMinutes - currentMinutes);
}
