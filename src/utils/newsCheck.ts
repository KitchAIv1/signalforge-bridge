import { getSupabaseClient } from '../connectors/supabase.js';

const NEWS_WINDOW_PRE_MINUTES = 60;

/**
 * Checks if a signal for the given OANDA instrument
 * falls within a news event window.
 * Returns null if no news window, or event name if blocked.
 * 
 * Window: 60 min before event to confirmation_delay_minutes after.
 * Uses existing bridge Supabase client — same project as news_events.
 */
export async function getNewsWindowEvent(
  oandaInstrument: string
): Promise<string | null> {
  try {
    // Convert OANDA instrument (AUD_USD) to pair (AUDUSD)
    const pair = oandaInstrument.replace('_', '');
    const now = new Date();

    const { data, error } = await getSupabaseClient()
      .from('news_events')
      .select('event_name, event_datetime_utc, confirmation_delay_minutes')
      .contains('affected_pairs', [pair])
      .eq('is_active', true)
      .gte(
        'event_datetime_utc',
        new Date(now.getTime() - NEWS_WINDOW_PRE_MINUTES * 60_000).toISOString()
      )
      .lte(
        'event_datetime_utc',
        now.toISOString()
      )
      .order('event_datetime_utc', { ascending: true })
      .limit(5);

    if (error || !data) return null;

    for (const event of data) {
      const eventTime = new Date(event.event_datetime_utc).getTime();
      const nowMs = now.getTime();
      const preWindowMs = NEWS_WINDOW_PRE_MINUTES * 60_000;
      const postWindowMs = event.confirmation_delay_minutes * 60_000;

      const inPre = nowMs >= eventTime - preWindowMs && nowMs < eventTime;
      const inPost = nowMs >= eventTime && nowMs <= eventTime + postWindowMs;

      if (inPre || inPost) {
        return event.event_name;
      }
    }

    return null;
  } catch {
    // Never block a trade due to news check failure
    return null;
  }
}
