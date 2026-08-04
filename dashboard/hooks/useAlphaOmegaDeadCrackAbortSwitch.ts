'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { ALPHAOMEGA_DEAD_CRACK_ABORT_ENABLED_CONFIG_KEY } from '@/lib/omegaLaneBConstants';

function parseBool(raw: unknown): boolean {
  return raw === true || raw === 'true';
}

/**
 * Config-only toggle for the dead-crack abort exit.
 * No abort predicates here — bridge owns the exit logic.
 * Missing row → OFF (matches bridge default).
 */
export function useAlphaOmegaDeadCrackAbortSwitch() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('bridge_config')
      .select('config_value')
      .eq('config_key', ALPHAOMEGA_DEAD_CRACK_ABORT_ENABLED_CONFIG_KEY)
      .maybeSingle();
    setEnabled(data ? parseBool(data.config_value) : false);
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
    const { data, error } = await supabase
      .from('bridge_config')
      .update({ config_value: next, updated_at: new Date().toISOString() })
      .eq('config_key', ALPHAOMEGA_DEAD_CRACK_ABORT_ENABLED_CONFIG_KEY)
      .select('config_key')
      .maybeSingle();
    setIsSaving(false);
    if (error) {
      setToggleError(error.message);
      return;
    }
    if (!data) {
      setToggleError(
        'Config row missing — run migration 071_alphaomega_dead_crack_abort.sql',
      );
      return;
    }
    setEnabled(next);
  }, [enabled, isSaving]);

  return { enabled, toggleError, isSaving, handleToggle };
}
