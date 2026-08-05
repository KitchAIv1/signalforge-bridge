'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import {
  COMBINED_STACK_CONFIG_KEYS,
  parseBridgeConfigBool,
  resolveCombinedStackState,
  type CombinedStackState,
} from '@/lib/combinedStackConfig';

/**
 * Master Combined Stack switch: reads the three underlying keys and writes
 * them together (ON = all true, OFF = all false). Engines only ever read the
 * individual keys — this hook is pure config orchestration, no second source
 * of truth. Mixed state is reported honestly, never coerced.
 */
export function useCombinedStackSwitch() {
  const [stackState, setStackState] = useState<CombinedStackState | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadFlags = useCallback(async () => {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('bridge_config')
      .select('config_key, config_value')
      .in('config_key', [...COMBINED_STACK_CONFIG_KEYS]);
    const valueByKey = new Map(
      (data ?? []).map((row) => [row.config_key as string, row.config_value]),
    );
    const flagValues = COMBINED_STACK_CONFIG_KEYS.map((key) =>
      parseBridgeConfigBool(valueByKey.get(key)),
    );
    setStackState(resolveCombinedStackState(flagValues));
  }, []);

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  const handleToggle = useCallback(async () => {
    if (stackState == null || isSaving) return;
    setToggleError(null);
    setIsSaving(true);
    // Mixed resolves to ON: flipping the master aligns every lever.
    const next = stackState !== 'on';
    const supabase = getSupabase();
    const updates = await Promise.all(
      COMBINED_STACK_CONFIG_KEYS.map((configKey) =>
        supabase
          .from('bridge_config')
          .update({ config_value: next, updated_at: new Date().toISOString() })
          .eq('config_key', configKey)
          .select('config_key')
          .maybeSingle(),
      ),
    );
    setIsSaving(false);
    const failed = updates.find((result) => result.error);
    if (failed?.error) {
      setToggleError(failed.error.message);
      await loadFlags();
      return;
    }
    const missingIdx = updates.findIndex((result) => !result.data);
    if (missingIdx >= 0) {
      setToggleError(
        `Config row missing (${COMBINED_STACK_CONFIG_KEYS[missingIdx]}) — run migrations 072 + 073`,
      );
      await loadFlags();
      return;
    }
    setStackState(next ? 'on' : 'off');
  }, [isSaving, loadFlags, stackState]);

  return { stackState, toggleError, isSaving, handleToggle, reload: loadFlags };
}
