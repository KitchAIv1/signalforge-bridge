export function getVisibleHours(tag: string | null | undefined): number {
  if (tag === 'AMD_NONE' || tag === 'AMD_SHIFTED') return 20;
  return 17;
}
