'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { ALPHAOMEGA_ENABLED_CONFIG_KEY } from '@/lib/omegaLaneBConstants';

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
    const supabase = getSupabase();
    const { error } = await supabase
      .from('bridge_config')
      .update({ config_value: next, updated_at: new Date().toISOString() })
      .eq('config_key', ALPHAOMEGA_ENABLED_CONFIG_KEY);
    setIsSaving(false);
    if (error) {
      setToggleError(error.message);
      return;
    }
    setEnabled(next);
  }, [enabled, isSaving]);

  return { enabled, toggleError, isSaving, handleToggle };
}
