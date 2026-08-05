'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { parseBridgeConfigBool } from '@/lib/combinedStackConfig';

/**
 * Generic config-only boolean switch for a bridge_config key.
 * No gate/exit math here — bridge owns the logic. Missing row → OFF
 * (matches bridge fail-safe defaults); toggling a missing row surfaces
 * the migration hint instead of silently inserting.
 */
export function useBridgeConfigBoolSwitch(configKey: string, missingRowHint: string) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('bridge_config')
      .select('config_value')
      .eq('config_key', configKey)
      .maybeSingle();
    setEnabled(data ? parseBridgeConfigBool(data.config_value) : false);
  }, [configKey]);

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
      .eq('config_key', configKey)
      .select('config_key')
      .maybeSingle();
    setIsSaving(false);
    if (error) {
      setToggleError(error.message);
      return;
    }
    if (!data) {
      setToggleError(missingRowHint);
      return;
    }
    setEnabled(next);
  }, [configKey, enabled, isSaving, missingRowHint]);

  return { enabled, toggleError, isSaving, handleToggle, reload: loadConfig };
}
