/**
 * Must match src/core/rebuildHourGate.ts — DEFAULT_REBUILD_BLOCKED_HOURS_UTC
 * (dashboard cannot import bridge src).
 */
export const REBUILD_BLOCKED_HOURS_UTC: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 14, 15, 19, 20, 21,
];
