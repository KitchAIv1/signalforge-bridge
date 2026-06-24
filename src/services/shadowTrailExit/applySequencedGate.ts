/** Apply one-at-a-time sequenced gate — baseline and optimized lanes. */

import type { SequencedStatus, ShadowTrailRow } from './types.js';

const BAR_MS = 5 * 60 * 1000;

interface SequencedTrack {
  openUntilMs: number;
}

interface GateLaneConfig {
  exitBars: (row: ShadowTrailRow) => number | null | undefined;
  pipsNet: (row: ShadowTrailRow) => number | null | undefined;
  statusKey: 'sequenced_status' | 'sequenced_opt_status';
  pipsKey: 'sequenced_pips_net' | 'sequenced_opt_pips_net';
}

function applyGateLane(
  rows: ShadowTrailRow[],
  lane: GateLaneConfig,
): ShadowTrailRow[] {
  const sorted = [...rows].sort(
    (left, right) => Date.parse(left.fired_at) - Date.parse(right.fired_at),
  );
  let open: SequencedTrack | null = null;
  return sorted.map(row => {
    const exitBars = lane.exitBars(row);
    if (!row.filter_passed || exitBars == null) {
      return {
        ...row,
        [lane.statusKey]: 'skipped' as SequencedStatus,
        [lane.pipsKey]: null,
      };
    }
    const firedMs = Date.parse(row.fired_at);
    if (open != null && firedMs < open.openUntilMs) {
      return {
        ...row,
        [lane.statusKey]: 'blocked' as SequencedStatus,
        [lane.pipsKey]: null,
      };
    }
    open = { openUntilMs: firedMs + exitBars * BAR_MS };
    return {
      ...row,
      [lane.statusKey]: 'executed' as SequencedStatus,
      [lane.pipsKey]: lane.pipsNet(row) ?? null,
    };
  });
}

const BASELINE_LANE: GateLaneConfig = {
  exitBars: row => row.shadow_exit_bars,
  pipsNet: row => row.shadow_pips_net,
  statusKey: 'sequenced_status',
  pipsKey: 'sequenced_pips_net',
};

const OPTIMIZED_LANE: GateLaneConfig = {
  exitBars: row => row.shadow_opt_exit_bars,
  pipsNet: row => row.shadow_opt_pips_net,
  statusKey: 'sequenced_opt_status',
  pipsKey: 'sequenced_opt_pips_net',
};

export function applySequencedGate(rows: ShadowTrailRow[]): ShadowTrailRow[] {
  return applyGateLane(rows, BASELINE_LANE);
}

export function applyOptimizedSequencedGate(rows: ShadowTrailRow[]): ShadowTrailRow[] {
  return applyGateLane(rows, OPTIMIZED_LANE);
}

export function applyAllSequencedGates(rows: ShadowTrailRow[]): ShadowTrailRow[] {
  const baseline = applySequencedGate(rows);
  return applyOptimizedSequencedGate(baseline);
}
