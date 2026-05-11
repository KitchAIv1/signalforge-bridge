'use client';

import { useCallback, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

export type CloseTagValue =
  | 'trail_correct'
  | 'would_close_earlier'
  | 'would_hold_longer'
  | 'wrong_direction';

export interface UseCloseTagResult {
  saveTag: (tradeId: string, tag: CloseTagValue, note?: string) => Promise<void>;
  isSaving: boolean;
  saveError: string | null;
}

export function useCloseTag(): UseCloseTagResult {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveTag = useCallback(
    async (tradeId: string, tag: CloseTagValue, note?: string) => {
      setIsSaving(true);
      setSaveError(null);
      try {
        const supabase = getSupabase();
        const { error } = await supabase
          .from('bridge_trade_log')
          .update({
            close_tag: note ? `${tag}::${note}` : tag,
          })
          .eq('id', tradeId);
        if (error) throw new Error(error.message);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  return { saveTag, isSaving, saveError };
}
