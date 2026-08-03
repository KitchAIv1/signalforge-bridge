import type { AlphaOmegaDirection } from '../alphaOmegaStreakTracker.js';
import type { SpeedfloorPaperTrigger } from './speedfloorPaperCloseReasons.js';

export const SPEEDFLOOR_PAPER_MAX_HOLD_HOURS = 3;

export interface SpeedfloorPaperCandle {
  time: string;
  h: number;
  l: number;
  c: number;
}

export interface SpeedfloorPaperFire {
  signalId: string;
  direction: AlphaOmegaDirection;
  firedAt: string;
  markPrice: number | null;
}

export interface SpeedfloorPaperWalkResult {
  open: boolean;
  trigger: SpeedfloorPaperTrigger | 'open';
  exitAt: string;
  exitPrice: number;
}
