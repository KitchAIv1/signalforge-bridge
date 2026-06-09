export interface M5Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type DetectionDirection = 'long' | 'short';

export interface DetectionResult {
  detected: boolean;
  direction: DetectionDirection | null;
  detection_bar: number | null;
  net_pips: number | null;
}

export function notDetectedResult(): DetectionResult {
  return {
    detected: false,
    direction: null,
    detection_bar: null,
    net_pips: null,
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
