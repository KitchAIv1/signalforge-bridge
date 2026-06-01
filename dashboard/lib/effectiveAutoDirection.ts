import type { AmdState } from '@/lib/types';

/** Frozen 10:31 decision direction; falls back to live auto_direction when unset. */
export function resolveEffectiveAutoDirection(amdState: AmdState | null): string | null {
  return amdState?.decision_auto_direction ?? amdState?.auto_direction ?? null;
}
