import { REFINED_ASIA_FLIP } from '../omegaLiveCounterfactual/refinedRules.js';
import {
  advanceFlipState,
  emptyFlipState,
  shouldBlockFlipEntry,
} from '../omegaLiveCounterfactual/flipRules.js';
import type { DayFlags } from './computeFlags.js';
import { isDistSignal } from './computeFlags.js';

export interface SimTrade {
  signalReceivedAt: string;
  closedAt: string;
  direction: 'long' | 'short';
  pnlPips: number;
  closeReason: string | null;
}

export type SlowdownId =
  | 'actual'
  | 'r1_only'
  | 'sd_dist_skip_caution'
  | 'sd_dist_skip_two_plus'
  | 'sd_opp_after_storm'
  | 'sd_opp_after_two_plus'
  | 'r1_sd_opp_two_plus';

export interface SlowdownRule {
  id: SlowdownId;
  label: string;
}

export const SLOWDOWN_RULES: SlowdownRule[] = [
  { id: 'actual', label: 'Actual live' },
  { id: 'r1_only', label: 'R1: Asia small-trail opposite 90m (00-05)' },
  {
    id: 'sd_dist_skip_caution',
    label: 'SD: Skip dist (10:31-16) when day_caution AMD',
  },
  {
    id: 'sd_dist_skip_two_plus',
    label: 'SD: Skip dist when 2+ flags by 10:31',
  },
  {
    id: 'sd_opp_after_storm',
    label: 'SD: Skip opposite fills after flip_storm triggers',
  },
  {
    id: 'sd_opp_after_two_plus',
    label: 'SD: Skip opposite fills after 10:31 when 2+ flags',
  },
  {
    id: 'r1_sd_opp_two_plus',
    label: 'R1 + skip opposite after 10:31 when 2+ flags',
  },
];

function atMs(iso: string): number {
  return Date.parse(iso);
}

function isAfter1031(ms: number): boolean {
  const d = new Date(ms);
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return mins >= 10 * 60 + 31;
}

export function simulateDayPips(
  trades: SimTrade[],
  flags: DayFlags,
  ruleId: SlowdownId,
): number {
  let flipState = emptyFlipState();
  let lastDirection: SimTrade['direction'] | null = null;
  let total = 0;

  for (const trade of trades) {
    const firedMs = atMs(trade.signalReceivedAt);
    let blocked = false;

    const applyR1 = ruleId === 'r1_only' || ruleId === 'r1_sd_opp_two_plus';
    if (applyR1) {
      if (
        shouldBlockFlipEntry(
          {
            signalReceivedAt: trade.signalReceivedAt,
            closedAt: trade.closedAt,
            direction: trade.direction,
            pnlPips: trade.pnlPips,
            closeReason: trade.closeReason,
            brokerId: 'oanda_practice',
            durationMinutes: 0,
            pnlR: null,
          },
          flipState,
          REFINED_ASIA_FLIP,
        )
      ) {
        blocked = true;
      }
    }

    if (!blocked && ruleId === 'sd_dist_skip_caution' && flags.dayCautionAmd && isDistSignal(firedMs)) {
      blocked = true;
    }
    if (!blocked && ruleId === 'sd_dist_skip_two_plus' && flags.twoPlusFlags && isDistSignal(firedMs)) {
      blocked = true;
    }
    if (
      !blocked &&
      ruleId === 'sd_opp_after_storm' &&
      flags.flipStormAtMs != null &&
      firedMs >= flags.flipStormAtMs &&
      lastDirection != null &&
      trade.direction !== lastDirection
    ) {
      blocked = true;
    }
    if (
      !blocked &&
      (ruleId === 'sd_opp_after_two_plus' || ruleId === 'r1_sd_opp_two_plus') &&
      flags.twoPlusFlags &&
      isAfter1031(firedMs) &&
      lastDirection != null &&
      trade.direction !== lastDirection
    ) {
      blocked = true;
    }

    if (!blocked) {
      total += trade.pnlPips;
      lastDirection = trade.direction;
      if (applyR1) {
        flipState = advanceFlipState(flipState, {
          signalReceivedAt: trade.signalReceivedAt,
          closedAt: trade.closedAt,
          direction: trade.direction,
          pnlPips: trade.pnlPips,
          closeReason: trade.closeReason,
          brokerId: 'oanda_practice',
          durationMinutes: 0,
          pnlR: null,
        });
      } else {
        lastDirection = trade.direction;
      }
    }
  }

  return Math.round(total * 10) / 10;
}
