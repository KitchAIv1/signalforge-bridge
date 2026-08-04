'use client';

import { useCallback, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { NewsEventRow } from '@/lib/types';
import { usePollingInterval } from '@/hooks/usePollingInterval';

const REFRESH_MS = 2 * 60 * 1000;
const DEFAULT_LOOKAHEAD_DAYS = 7;
const LOOKBEHIND_HOURS = 6;

export function useUpcomingNewsEvents(options?: {
  lookaheadDays?: number;
}): {
  upcoming: NewsEventRow[];
  recent: NewsEventRow[];
  isLoading: boolean;
  lookaheadDays: number;
} {
  const lookaheadDays = options?.lookaheadDays ?? DEFAULT_LOOKAHEAD_DAYS;
  const [upcoming, setUpcoming] = useState<NewsEventRow[]>([]);
  const [recent, setRecent] = useState<NewsEventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEvents = useCallback(async (): Promise<void> => {
    try {
      const supabase = getSupabase();
      const pastISO = new Date(
        Date.now() - LOOKBEHIND_HOURS * 60 * 60 * 1000,
      ).toISOString();
      const futureISO = new Date(
        Date.now() + lookaheadDays * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data, error } = await supabase
        .from('news_events')
        .select(
          'id, event_name, event_datetime_utc, ' +
            'affected_pairs, pre_event_action, ' +
            'post_event_direction, currency, ' +
            'impact, tier, ' +
            'confirmation_delay_minutes',
        )
        .gte('event_datetime_utc', pastISO)
        .lte('event_datetime_utc', futureISO)
        .eq('is_active', true)
        .order('event_datetime_utc', { ascending: true });

      if (error) return;

      const all = (data ?? []) as unknown as NewsEventRow[];
      const now = Date.now();

      setUpcoming(
        all.filter((e) => new Date(e.event_datetime_utc).getTime() >= now),
      );
      setRecent(
        all.filter((e) => new Date(e.event_datetime_utc).getTime() < now),
      );
    } finally {
      setIsLoading(false);
    }
  }, [lookaheadDays]);

  usePollingInterval(() => void fetchEvents(), REFRESH_MS);

  return { upcoming, recent, isLoading, lookaheadDays };
}
