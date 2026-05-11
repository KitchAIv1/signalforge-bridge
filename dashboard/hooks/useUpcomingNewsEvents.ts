'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { NewsEventRow } from '@/lib/types';

const REFRESH_MS = 5 * 60 * 1000;
const LOOKAHEAD_HOURS = 24;

export function useUpcomingNewsEvents(): {
  events: NewsEventRow[];
  isLoading: boolean;
} {
  const [events, setEvents] = useState<NewsEventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchEvents(): Promise<void> {
      try {
        const supabase = getSupabase();
        const nowISO = new Date().toISOString();
        const endISO = new Date(Date.now() + LOOKAHEAD_HOURS * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
          .from('news_events')
          .select(
            'id, event_name, event_datetime_utc, affected_pairs, pre_event_action, post_event_direction, confirmation_delay_minutes'
          )
          .gte('event_datetime_utc', nowISO)
          .lte('event_datetime_utc', endISO)
          .order('event_datetime_utc', { ascending: true });

        if (error) {
          setEvents([]);
          return;
        }
        setEvents((data ?? []) as NewsEventRow[]);
      } finally {
        setIsLoading(false);
      }
    }

    void fetchEvents();
    const interval = window.setInterval(() => void fetchEvents(), REFRESH_MS);
    return () => window.clearInterval(interval);
  }, []);

  return { events, isLoading };
}
