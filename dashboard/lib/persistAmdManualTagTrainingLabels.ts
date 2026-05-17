import { getSupabase } from '@/lib/supabase';

export interface PersistAmdManualTrainingLabelsInput {
  rowId: string;
  amdTagManualOverride: string;
  overrideReason: string | null;
}

/** Training-label only — execution services must ignore these columns. */
export async function persistAmdManualTagTrainingLabels(
  payload: PersistAmdManualTrainingLabelsInput
): Promise<void> {
  const trimmedReason = payload.overrideReason?.trim() ?? '';
  const supabase = getSupabase();

  const { error: persistError } = await supabase
    .from('amd_state')
    .update({
      amd_tag_manual_override: payload.amdTagManualOverride,
      override_reason: trimmedReason !== '' ? trimmedReason : null,
      override_set_at: new Date().toISOString(),
    })
    .eq('id', payload.rowId);

  if (persistError) throw new Error(persistError.message);
}
