'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { ALPHAOMEGA_ENABLED_CONFIG_KEY } from '@/lib/omegaLaneBConstants';
import { persistAlphaOmegaKillSwitch } from '@/lib/persistAlphaOmegaKillSwitch';

function parseBool(raw: unknown): boolean {
  return raw === true || raw === 'true';
}

export function useAlphaOmegaKillSwitch() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('bridge_config')
      .select('config_value')
      .eq('config_key', ALPHAOMEGA_ENABLED_CONFIG_KEY)
      .maybeSingle();
    setEnabled(data ? parseBool(data.config_value) : true);
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const handleToggle = useCallback(async () => {
    if (enabled == null || isSaving) return;
    setToggleError(null);
    setIsSaving(true);
    const next = !enabled;
    const persistError = await persistAlphaOmegaKillSwitch(next);
    setIsSaving(false);
    if (persistError) {
      setToggleError(persistError);
      return;
    }
    setEnabled(next);
  }, [enabled, isSaving]);

  return { enabled, toggleError, isSaving, handleToggle };
}
