/** Speed-based Asian session shape taxonomy (research/advisory only). */

export type AsianShapeLabel =
  | 'clean-trend'
  | 'clean-v'
  | 'check'
  | 'inverted-check'
  | 'round-trip-spike'
  | 'unclassified';

export interface AsianShapeInputs {
  tradeDate: string;
  turnTime: string;
  preTurnSpeed: number;
  postTurnSpeed: number;
  postTurnPips: number;
  postTurnMinutes: number;
  retracementPct: number;
}

export type TurnPositionBand = 'early' | 'middle' | 'late';
export type SpeedRatioBand = 'post_faster' | 'post_slower' | 'roughly_equal';

const SESSION_MINUTES = 8 * 60;
const SETTLED_BUFFER_MINUTES = 45;

export function computeTurnPositionFraction(turnTime: string, tradeDate: string): number {
  const sessionStartMs = Date.parse(`${tradeDate}T00:00:00.000Z`);
  const turnMs = Date.parse(turnTime);
  return (turnMs - sessionStartMs) / (SESSION_MINUTES * 60 * 1000);
}

export function turnPositionBand(fraction: number): TurnPositionBand {
  if (fraction < 0.33) return 'early';
  if (fraction <= 0.67) return 'middle';
  return 'late';
}

export function speedRatioBand(preSpeed: number, postSpeed: number): SpeedRatioBand {
  if (preSpeed <= 0) return postSpeed > 0 ? 'post_faster' : 'roughly_equal';
  const ratio = postSpeed / preSpeed;
  if (ratio > 1.2) return 'post_faster';
  if (ratio < 0.8) return 'post_slower';
  return 'roughly_equal';
}

function isRoundTripSettled(row: AsianShapeInputs, remainingMinutes: number): boolean {
  if (row.preTurnSpeed <= 0) return false;
  const legEstimateMinutes = Math.abs(row.postTurnPips) / row.preTurnSpeed;
  return remainingMinutes - legEstimateMinutes >= SETTLED_BUFFER_MINUTES;
}

function classifyMidRetrace(
  position: TurnPositionBand,
  speed: SpeedRatioBand,
): AsianShapeLabel | null {
  if (position === 'middle' && speed === 'roughly_equal') return 'clean-v';
  if (position !== 'late' && speed === 'post_slower') return 'check';
  if (position === 'late' && speed === 'post_faster') return 'inverted-check';
  return null;
}

export interface AsianShapeClassification {
  shape: AsianShapeLabel;
  unclassifiedReason: string | null;
}

export function classifyAsianShapeFromInputs(row: AsianShapeInputs): AsianShapeClassification {
  if (row.retracementPct <= 20) {
    return { shape: 'clean-trend', unclassifiedReason: null };
  }

  const position = turnPositionBand(computeTurnPositionFraction(row.turnTime, row.tradeDate));
  const speed = speedRatioBand(row.preTurnSpeed, row.postTurnSpeed);

  if (row.retracementPct >= 100) {
    if (position === 'late') {
      return { shape: 'unclassified', unclassifiedReason: 'round_trip_late_turn' };
    }
    if (isRoundTripSettled(row, row.postTurnMinutes)) {
      return { shape: 'round-trip-spike', unclassifiedReason: null };
    }
    return { shape: 'unclassified', unclassifiedReason: 'round_trip_still_resolving' };
  }

  const midShape = classifyMidRetrace(position, speed);
  if (midShape) return { shape: midShape, unclassifiedReason: null };

  return {
    shape: 'unclassified',
    unclassifiedReason: `mid_retrace_unmatched:${position}/${speed}`,
  };
}
