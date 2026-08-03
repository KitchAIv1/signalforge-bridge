/**
 * Diagnostic / causal / crack / exit labels for sideways scorecard.
 */

import type { LiveAoTradeRow } from '../aoRefuseTapeCf/types.js';
import {
  MIN_BARS_CAUSAL,
  MIN_RANGE_PIPS,
  type TapeStats,
} from './tapeStats.js';

export type DayTapeLabel = 'RANGE_SIDEWAYS' | 'TREND_DAY' | 'MIXED' | 'UNKNOWN';
export type CrackQuality = 'SHALLOW' | 'DEEP' | 'OTHER';
export type ExitClass =
  | 'HARD_STOP'
  | 'OPPOSING'
  | 'GIVEBACK'
  | 'BACKSTOP'
  | 'OTHER';
export type WeaknessLabel =
  | 'DEAD_CRACK_NO_FT'
  | 'GAVE_BACK_WIN'
  | 'SHALLOW_CRACK'
  | 'NONE';

export function labelDayTape(tape: TapeStats): DayTapeLabel {
  if (tape.nBars < MIN_BARS_CAUSAL || tape.rangePips < MIN_RANGE_PIPS) {
    return 'UNKNOWN';
  }
  if (tape.efficiency < 0.25 && tape.flipRate >= 0.35) return 'RANGE_SIDEWAYS';
  if (Math.abs(tape.netPips) >= 20 && tape.efficiency >= 0.35) return 'TREND_DAY';
  return 'MIXED';
}

/** Causal: same cuts as diagnostic, else UNKNOWN when window too thin. */
export function labelCausalTape(tape: TapeStats): DayTapeLabel {
  return labelDayTape(tape);
}

export function labelCrackQuality(trade: LiveAoTradeRow): CrackQuality {
  if (trade.foundingLength <= 0) return 'OTHER';
  if (trade.foundingLength <= 7 && trade.foundingSpeedMin <= 40) return 'SHALLOW';
  if (trade.foundingLength >= 8) return 'DEEP';
  return 'OTHER';
}

export function labelExitClass(closeReason: string | null): ExitClass {
  const reason = (closeReason ?? '').toLowerCase();
  if (reason.includes('hard_stop')) return 'HARD_STOP';
  if (reason.includes('opposing')) return 'OPPOSING';
  if (reason.includes('giveback')) return 'GIVEBACK';
  if (reason.includes('backstop')) return 'BACKSTOP';
  return 'OTHER';
}

export function labelWeakness(
  trade: LiveAoTradeRow,
  mfe: number,
  mae: number,
): WeaknessLabel {
  if (trade.pnlPips < 0 && mfe < 1.5 && mae >= 3) return 'DEAD_CRACK_NO_FT';
  if (trade.pnlPips < 0 && mfe >= 4) return 'GAVE_BACK_WIN';
  if (
    trade.pnlPips < 0 &&
    trade.foundingLength <= 7 &&
    trade.foundingSpeedMin <= 40
  ) {
    return 'SHALLOW_CRACK';
  }
  return 'NONE';
}

export function tagConfigEra(trade: LiveAoTradeRow): string {
  if (trade.pureSizing) return 'PURE_SIZE';
  return 'LEGACY_SIZE';
}

export function isHoldoutTrade(entryAt: string, holdoutFromIso: string): boolean {
  return Date.parse(entryAt) >= Date.parse(holdoutFromIso);
}
