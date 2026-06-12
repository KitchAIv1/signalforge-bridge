export interface M5Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type DetectionDirection = 'long' | 'short';

export type DetectionFailureReason =
  | 'INSUFFICIENT_CANDLES'
  | 'BELOW_THRESHOLD'
  | 'ADVERSE_BAR'
  | 'NO_MOMENTUM'
  | 'NO_RETEST'
  | 'NO_EARLY_EXTREME';

export interface DetectionResult {
  detected: boolean;
  direction: DetectionDirection | null;
  detection_bar: number | null;
  net_pips: number | null;
  failure_reason?: DetectionFailureReason;
  evaluated_net_pips?: number | null;
  evaluated_direction?: DetectionDirection | null;
}

export function notDetectedResult(diagnostics?: {
  failure_reason?: DetectionFailureReason;
  evaluated_net_pips?: number | null;
  evaluated_direction?: DetectionDirection | null;
}): DetectionResult {
  return {
    detected: false,
    direction: null,
    detection_bar: null,
    net_pips: null,
    ...diagnostics,
  };
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export type AsianSessionDetectionAction =
  | 'SET_LONG'
  | 'SET_SHORT'
  | 'NO_DETECTION'
  | 'FETCH_INSUFFICIENT_CANDLES'
  | 'SKIPPED_MANUAL_MODE'
  | 'ALREADY_SET';
