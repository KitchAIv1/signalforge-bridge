'use client';

import type { ChangeEvent } from 'react';
import { useState } from 'react';
import type { AmdState } from '@/lib/types';
import { persistAmdManualTagTrainingLabels } from '@/lib/persistAmdManualTagTrainingLabels';

type SaveBannerTone = Readonly<{ tone: 'ok' | 'err'; body: string }>;

export interface UseAmdIntelManualTagDraft {
  tagChoice: string;
  reasonDraft: string;
  bindTagSelect(selectChange: ChangeEvent<HTMLSelectElement>): void;
  bindReasonInput(change: ChangeEvent<HTMLInputElement>): void;
  formLocked: boolean;
  saving: boolean;
  saveBanner: SaveBannerTone | null;
  highlightCurrentOverride: boolean;
  persistTrainingChoice(): Promise<void>;
}

export function useAmdIntelManualTagOverrideDraft(
  amdState: AmdState | null,
  refetch: () => void
): UseAmdIntelManualTagDraft {
  const [tagChoice, setTagChoice] = useState('');
  const [reasonDraft, setReasonDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveBanner, setSaveBanner] = useState<SaveBannerTone | null>(null);

  const trimmedManualTag = amdState?.amd_tag_manual_override?.trim() ?? '';
  const formLocked = saving || tagChoice === '' || amdState == null;

  async function persistTrainingChoice(): Promise<void> {
    if (!amdState || tagChoice === '') return;
    setSaving(true);
    setSaveBanner(null);
    try {
      await persistAmdManualTagTrainingLabels({
        rowId: amdState.id,
        amdTagManualOverride: tagChoice,
        overrideReason: reasonDraft.trim() !== '' ? reasonDraft : null,
      });
      setSaveBanner({ tone: 'ok', body: 'Override saved' });
      refetch();
    } catch (saveErr: unknown) {
      setSaveBanner({
        tone: 'err',
        body: saveErr instanceof Error ? saveErr.message : 'Save failed',
      });
    } finally {
      setSaving(false);
    }
  }

  function bindTagSelect(selectChange: ChangeEvent<HTMLSelectElement>): void {
    setTagChoice(selectChange.target.value);
  }

  function bindReasonInput(change: ChangeEvent<HTMLInputElement>): void {
    setReasonDraft(change.target.value);
  }

  return {
    tagChoice,
    reasonDraft,
    bindTagSelect,
    bindReasonInput,
    formLocked,
    saving,
    saveBanner,
    highlightCurrentOverride: trimmedManualTag !== '',
    persistTrainingChoice,
  };
}
