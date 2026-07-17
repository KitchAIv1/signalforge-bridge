'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

export type PdlWindowLiveStatus = {
  engineActive: boolean;
  paused: boolean;
  loading: boolean;
};

export function usePdlWindowLiveStatus(): PdlWindowLiveStatus {
  const [engineActive, setEngineActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = getSupabase();
        const [engineRes, pauseRes] = await Promise.all([
          supabase
            .from('bridge_engines')
            .select('is_active')
            .eq('engine_id', 'pdl_window')
            .maybeSingle(),
          supabase
            .from('bridge_config')
            .select('config_value')
            .eq('config_key', 'paused_engines')
            .maybeSingle(),
        ]);
        if (cancelled) return;
        setEngineActive(Boolean(engineRes.data?.is_active));
        const raw = pauseRes.data?.config_value;
        let list: unknown = raw;
        if (typeof raw === 'string') {
          try {
            list = JSON.parse(raw);
          } catch {
            list = [];
          }
        }
        setPaused(Array.isArray(list) && list.map(String).includes('pdl_window'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { engineActive, paused, loading };
}
