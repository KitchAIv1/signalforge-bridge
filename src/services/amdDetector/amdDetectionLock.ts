/** Detection lock helpers — amd_state immutability after 10:31 upsert. */

export type DetectionLockRow = {
  detection_locked: boolean | null;
  detection_locked_at: string | null;
  detection_locked_reason: string | null;
};

export function shouldSkipAmdDetectionForLockedRow(
  existingRow: DetectionLockRow | null | undefined,
): boolean {
  return existingRow?.detection_locked === true;
}

export function buildInitialDetectionLockFields(evaluatedAtISO: string) {
  return {
    detection_locked: true as const,
    detection_locked_at: evaluatedAtISO,
    detection_locked_reason: 'initial_10:31_detection' as const,
  };
}
