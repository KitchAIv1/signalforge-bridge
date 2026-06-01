/** Immutable 10:31 decision snapshot — preserved across detection reruns. */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AmdAutoDirectionSnapshot } from './amdTypes.js';

const AUD_AMD_PAIR = 'AUD_USD';

export type ExistingDecisionSnapshot = {
  decision_auto_direction: string | null;
  decision_evaluated_at: string | null;
};

export type DecisionSnapshotFields = {
  decision_auto_direction: string;
  decision_evaluated_at: string;
};

export async function fetchExistingDecisionSnapshot(
  supabaseDb: SupabaseClient,
  tradeDate: string,
): Promise<ExistingDecisionSnapshot | null> {
  const { data, error } = await supabaseDb
    .from('amd_state')
    .select('decision_auto_direction, decision_evaluated_at')
    .eq('trade_date', tradeDate)
    .eq('pair', AUD_AMD_PAIR)
    .maybeSingle();

  if (error) {
    console.warn('[AmdDetector] decision snapshot fetch failed:', error.message);
    return null;
  }

  return (data as ExistingDecisionSnapshot | null) ?? null;
}

export function resolveDecisionSnapshotFields(
  existingSnapshot: ExistingDecisionSnapshot | null,
  autoDir: AmdAutoDirectionSnapshot,
  evaluatedAtISO: string,
): DecisionSnapshotFields {
  return {
    decision_auto_direction:
      existingSnapshot?.decision_auto_direction ?? autoDir.auto_direction,
    decision_evaluated_at:
      existingSnapshot?.decision_evaluated_at ?? evaluatedAtISO,
  };
}
