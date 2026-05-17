'use client';

import type { AmdState } from '@/lib/types';
import { amdTagLabel } from '@/lib/amdPanelFormatters';
import {
  type UseAmdIntelManualTagDraft,
  useAmdIntelManualTagOverrideDraft,
} from '@/hooks/useAmdIntelManualTagOverrideDraft';
import { ManualOverrideTagSelect } from '@/components/ManualOverrideTagSelect';
import { ManualOverrideSaveButton } from '@/components/ManualOverrideSaveButton';

interface ManualOverrideInputsProps {
  draft: Pick<
    UseAmdIntelManualTagDraft,
    'tagChoice' | 'bindTagSelect' | 'reasonDraft' | 'bindReasonInput' | 'formLocked' | 'saving' | 'persistTrainingChoice'
  >;
}

function ManualOverrideInputs({ draft }: ManualOverrideInputsProps) {
  return (
    <>
      <ManualOverrideTagSelect value={draft.tagChoice} onTagSelect={draft.bindTagSelect} />
      <input
        value={draft.reasonDraft}
        placeholder="Reason (optional)"
        onChange={draft.bindReasonInput}
        className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
      />
      <ManualOverrideSaveButton
        disabled={draft.formLocked}
        saving={draft.saving}
        onSave={() => void draft.persistTrainingChoice()}
      />
    </>
  );
}

interface ManualOverrideStatusesProps {
  saveBanner: UseAmdIntelManualTagDraft['saveBanner'];
  amdState: AmdState | null;
  highlightCurrentOverride: boolean;
}

function ManualOverrideStatuses({ saveBanner, amdState, highlightCurrentOverride }: ManualOverrideStatusesProps) {
  return (
    <>
      {saveBanner != null && (
        <span
          className={
            saveBanner.tone === 'ok'
              ? 'text-xs text-emerald-600 dark:text-emerald-400'
              : 'text-xs text-red-600 dark:text-red-400'
          }
        >
          {saveBanner.body}
        </span>
      )}
      {amdState == null && (
        <span className="text-xs text-slate-500">
          No amd_state row yet for today — override unavailable.
        </span>
      )}
      {highlightCurrentOverride && amdState != null && (
        <span className="text-xs text-amber-600 dark:text-amber-400">
          Current override: {amdTagLabel(amdState.amd_tag_manual_override)}{' '}
          {amdState.override_reason?.trim() ? `— ${amdState.override_reason}` : ''}
        </span>
      )}
    </>
  );
}

interface AmdIntelManualTagOverrideProps {
  amdState: AmdState | null;
  refetch: () => void;
}

/** Persists amd_tag_manual_override / override_reason / override_set_at on amd_state (training labels). */
export function AmdIntelManualTagOverride({ amdState, refetch }: AmdIntelManualTagOverrideProps) {
  const draft = useAmdIntelManualTagOverrideDraft(amdState, refetch);

  return (
    <details className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-3 py-2">
      <summary className="cursor-pointer select-none text-xs font-medium text-slate-600 dark:text-slate-400">
        Override AMD tag (training label)
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <ManualOverrideInputs draft={draft} />
        <ManualOverrideStatuses
          saveBanner={draft.saveBanner}
          amdState={amdState}
          highlightCurrentOverride={draft.highlightCurrentOverride}
        />
      </div>
    </details>
  );
}
