/** Apply one-at-a-time sequenced gate to resolved shadow rows. */

import type { SequencedStatus, ShadowTrailRow } from './types.js';

const BAR_MS = 5 * 60 * 1000;

interface SequencedTrack {
  openUntilMs: number;
}

export function applySequencedGate(rows: ShadowTrailRow[]): ShadowTrailRow[] {
  const sorted = [...rows].sort(
    (a, b) => Date.parse(a.fired_at) - Date.parse(b.fired_at),
  );
  let open: SequencedTrack | null = null;
  return sorted.map(row => {
    if (!row.filter_passed || row.shadow_exit_bars == null) {
      return { ...row, sequenced_status: 'skipped' as SequencedStatus, sequenced_pips_net: null };
    }
    const firedMs = Date.parse(row.fired_at);
    if (open != null && firedMs < open.openUntilMs) {
      return { ...row, sequenced_status: 'blocked' as SequencedStatus, sequenced_pips_net: null };
    }
    open = { openUntilMs: firedMs + row.shadow_exit_bars * BAR_MS };
    return {
      ...row,
      sequenced_status: 'executed' as SequencedStatus,
      sequenced_pips_net: row.shadow_pips_net,
    };
  });
}
