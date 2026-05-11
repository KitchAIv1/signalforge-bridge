/** Pure formatters for activity views (no fetching). */

export function formatActivityIsoTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    hour12: false,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
