'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { NewsEventRow } from '@/lib/types';

const REFRESH_MS = 2 * 60 * 1000; // 2 min refresh
const LOOKAHEAD_DAYS = 7;          // show 7 days ahead
const LOOKBEHIND_HOURS = 6;        // show last 6 hours

export function useUpcomingNewsEvents(): {
  upcoming: NewsEventRow[];
  recent: NewsEventRow[];
  isLoading: boolean;
} {
  const [upcoming, setUpcoming] =
    useState<NewsEventRow[]>([]);
  const [recent, setRecent] =
    useState<NewsEventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchEvents(): Promise<void> {
      try {
        const supabase = getSupabase();
        const nowISO = new Date().toISOString();
        const pastISO = new Date(
          Date.now() - LOOKBEHIND_HOURS * 60 * 60 * 1000
        ).toISOString();
        const futureISO = new Date(
          Date.now() +
          LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000
        ).toISOString();

        const { data, error } = await supabase
          .from('news_events')
          .select(
            'id, event_name, event_datetime_utc, ' +
            'affected_pairs, pre_event_action, ' +
            'post_event_direction, currency, ' +
            'impact, tier, ' +
            'confirmation_delay_minutes'
          )
          .gte('event_datetime_utc', pastISO)
          .lte('event_datetime_utc', futureISO)
          .eq('is_active', true)
          .order('event_datetime_utc',
            { ascending: true });

        if (error) return;

        const all =
          (data ?? []) as unknown as NewsEventRow[];
        const now = Date.now();

        setUpcoming(
          all.filter(e =>
            new Date(e.event_datetime_utc)
              .getTime() >= now
          )
        );
        setRecent(
          all.filter(e =>
            new Date(e.event_datetime_utc)
              .getTime() < now
          )
        );
      } finally {
        setIsLoading(false);
      }
    }

    void fetchEvents();
    const interval = window.setInterval(
      () => void fetchEvents(),
      REFRESH_MS
    );
    return () => window.clearInterval(interval);
  }, []);

  return { upcoming, recent, isLoading };
}
