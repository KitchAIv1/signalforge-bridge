import type { AmdState } from '@/lib/types';
import { judasDirectionLabel } from '@/lib/amdPanelFormatters';

export function formatJudasSwingSummary(state: AmdState): string {
  const directionLine = judasDirectionLabel(state.judas_direction ?? null);
  if (directionLine !== '—' && state.judas_pips != null) return `${directionLine} ${state.judas_pips}p`;
  if (directionLine !== '—') return directionLine;
  return state.judas_pips != null ? `${state.judas_pips}p` : '—';
}
