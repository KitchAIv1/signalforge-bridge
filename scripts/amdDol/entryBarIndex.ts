const ENTRY_BAR_BY_TAG: Record<string, number> = {
  AMD_TEXTBOOK: 24,
  AMD_COMPRESSION_BREAKOUT: 1,
  AMD_FAILED: 6,
  AMD_SHIFTED: 24,
  AMD_NONE: 1,
  INSUFFICIENT_DATA: -1,
};

export function entryBarIndexForTag(amdTag: string | null): number {
  if (!amdTag) return -1;
  return ENTRY_BAR_BY_TAG[amdTag] ?? -1;
}
