'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import {
  KEY_OMEGA_DIR,
  parseOmegaDir,
  parseDirectionMode,
  writeOmegaDir,
} from '@/lib/engineControlConfig';
import type { RegimeState } from '@/lib/types';

const REFRESH_MS = 30_000;

export interface RegimePanelData {
  regimeState:     RegimeState | null;
  omegaDirection:  'long' | 'short';
  isLoading:       boolean;
  fetchError:      string | null;
  flipDirection:   (direction: 'long' | 'short') => Promise<void>;
  directionMode:   'auto' | 'manual';
}

export function useRegimeState(): RegimePanelData {
  const [regimeState,    setRegimeState]    = useState<RegimeState | null>(null);
  const [omegaDirection, setOmegaDirection] = useState<'long' | 'short'>('long');
  const [directionMode, setDirectionMode] = useState<'auto' | 'manual'>('manual');
  const [isLoading,      setIsLoading]      = useState(true);
  const [fetchError,     setFetchError]     = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const supabase = getSupabase();

      const { data: regimeRow, error: regimeError } = await supabase
        .from('regime_state')
        .select('*')
        .eq('pair', 'AUD_USD')
        .order('evaluated_at', { ascending: false })
        .limit(1)
        .single();

      if (regimeError && regimeError.code !== 'PGRST116') {
        throw new Error(`regime_state: ${regimeError.message}`);
      }

      const { data: configRow, error: configError } = await supabase
        .from('bridge_config')
        .select('config_value')
        .eq('config_key', KEY_OMEGA_DIR)
        .single();

      if (configError && configError.code !== 'PGRST116') {
        throw new Error(`bridge_config: ${configError.message}`);
      }

      setRegimeState((regimeRow as RegimeState | null) ?? null);
      setOmegaDirection(parseOmegaDir(configRow?.config_value));

      const { data: modeRow } = await supabase
        .from('bridge_config')
        .select('config_value')
        .eq('config_key', 'direction_mode')
        .maybeSingle();
      setDirectionMode(parseDirectionMode(modeRow?.config_value));

      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const flipDirection = useCallback(async (direction: 'long' | 'short') => {
    try {
      const supabase = getSupabase();
      await writeOmegaDir(supabase, direction);
      setOmegaDirection(direction);
    } catch (err) {
      setFetchError(
        `Direction flip failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const interval = window.setInterval(() => void fetchData(), REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [fetchData]);

  return { regimeState, omegaDirection, isLoading, fetchError, flipDirection, directionMode };
}
