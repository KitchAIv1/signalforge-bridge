/** Earliest month navigable in the P&L calendar (April 2026, UTC). */
export const PNL_CALENDAR_EARLIEST_UTC_MS = Date.UTC(2026, 3, 1);

/** Trades on/after this instant are included in the calendar query. */
export const PNL_CALENDAR_QUERY_START_ISO = '2026-04-30T00:00:00Z';

export const CALENDAR_START = new Date('2026-04-30T00:00:00Z');

/** Supabase default max rows per request — paginate past this. */
export const PNL_CALENDAR_PAGE_SIZE = 1000;

/** Hard cap so a runaway loop cannot hammer the API. */
export const PNL_CALENDAR_MAX_PAGES = 50;

export const PNL_CALENDAR_ENGINE_IDS = [
  'omega',
  'engine_rebuild',
  'scalper',
  'engine_amd',
  'omega_inverse',
  'audusd_fade',
  'pdl_window',
] as const;

export const ENGINE_COLORS: Record<string, string> = {
  omega: '#7c3aed',
  engine_rebuild: '#d97706',
  scalper: '#1D9E75',
  engine_amd: '#f59e0b',
  omega_inverse: '#c026d3',
  audusd_fade: '#0ea5e9',
  pdl_window: '#14b8a6',
};
