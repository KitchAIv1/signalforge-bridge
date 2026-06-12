/** Earliest month navigable in the P&L calendar (April 2026, UTC). */
export const PNL_CALENDAR_EARLIEST_UTC_MS = Date.UTC(2026, 3, 1);

/** Trades on/after this instant are included in the calendar query. */
export const PNL_CALENDAR_QUERY_START_ISO = '2026-04-30T00:00:00Z';

export const CALENDAR_START = new Date('2026-04-30T00:00:00Z');

export const ENGINE_COLORS: Record<string, string> = {
  omega: '#7c3aed',
  engine_rebuild: '#d97706',
  scalper: '#1D9E75',
  engine_amd: '#f59e0b',
  omega_inverse: '#c026d3',
};
