/** Normalize broker close/open timestamps to ISO-8601 for Postgres timestamptz. */

export function normalizeBrokerTimestamp(value: unknown): string {
  if (value == null) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return new Date().toISOString();
}
