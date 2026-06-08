/**
 * Returns ISO string for the next 08:00:00 UTC occurrence.
 * Asian session direction validity window ends at 08:00 UTC.
 */
export function nextAsianSessionExpiry(): string {
  const now = new Date();
  const candidate = new Date(now);
  candidate.setUTCHours(8, 0, 0, 0);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate.toISOString();
}
