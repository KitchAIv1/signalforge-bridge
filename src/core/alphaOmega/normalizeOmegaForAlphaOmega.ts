/**
 * Relaxed Omega normalize for ALPHAOMEGA Lane B crack entries.
 * Skips the shared 4-pip rSize floor so cracks on tight fires can still trade
 * on Lane B. Lane A continues to use validateSignal unchanged.
 */

import type { SignalInsertPayload } from '../../connectors/supabase.js';
import { toOandaInstrument, isValidInstrument } from '../../utils/pairs.js';
import type { ValidationResult } from '../signalValidation.js';
import {
  readOmegaEngineId,
  readOmegaFireDirection,
  readOmegaFireTimestamp,
} from './alphaOmegaFireIdentity.js';

type NormalizedOmega = NonNullable<ValidationResult['normalized']>;

function readEntryPrice(payload: SignalInsertPayload): number | null {
  const low = payload.entry_zone_low != null ? Number(payload.entry_zone_low) : NaN;
  const high = payload.entry_zone_high != null ? Number(payload.entry_zone_high) : NaN;
  if (!Number.isNaN(low) && !Number.isNaN(high)) return (low + high) / 2;
  if (!Number.isNaN(low)) return low;
  if (!Number.isNaN(high)) return high;
  return null;
}

function stopLossOrientationOk(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  stopLoss: number,
): boolean {
  if (direction === 'LONG' && stopLoss >= entryPrice) return false;
  if (direction === 'SHORT' && stopLoss <= entryPrice) return false;
  return Math.abs(entryPrice - stopLoss) >= 1e-10;
}

/**
 * Structure-only normalize for Lane B crack fills. Returns null if the signal
 * lacks the minimum fields needed to size/place an order.
 */
export function normalizeOmegaForAlphaOmegaEntry(
  payload: SignalInsertPayload,
  defaultRiskReward: number,
): NormalizedOmega | null {
  const engineId = readOmegaEngineId(payload);
  const direction = readOmegaFireDirection(payload);
  const pair = (payload.pair ?? '').toString().trim();
  if (engineId !== 'omega' || !direction || !pair || !isValidInstrument(pair)) return null;

  const entryPrice = readEntryPrice(payload);
  const stopLoss = payload.stop_loss != null ? Number(payload.stop_loss) : NaN;
  if (entryPrice == null || Number.isNaN(stopLoss)) return null;
  if (!stopLossOrientationOk(direction, entryPrice, stopLoss)) return null;

  const takeProfit = resolveTakeProfit(payload, direction, entryPrice, stopLoss, defaultRiskReward);
  const confluenceRaw = payload.confluence_score != null ? Number(payload.confluence_score) : NaN;
  const confluenceScore = !Number.isNaN(confluenceRaw) && confluenceRaw > 0 ? confluenceRaw : 70;
  const slPipsFromSignal =
    payload.stop_loss_pips != null && !Number.isNaN(Number(payload.stop_loss_pips))
      ? Number(payload.stop_loss_pips)
      : null;

  return {
    engineId,
    pair,
    oandaInstrument: toOandaInstrument(pair),
    direction,
    confluenceScore,
    entryPrice,
    stopLoss,
    takeProfit,
    slPipsFromSignal,
    createdAt: readOmegaFireTimestamp(payload),
  };
}

function resolveTakeProfit(
  payload: SignalInsertPayload,
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  stopLoss: number,
  defaultRiskReward: number,
): number {
  if (payload.target_1 != null && !Number.isNaN(Number(payload.target_1))) {
    return Number(payload.target_1);
  }
  if (payload.take_profit != null && !Number.isNaN(Number(payload.take_profit))) {
    return Number(payload.take_profit);
  }
  const slDist = Math.abs(entryPrice - stopLoss);
  return direction === 'LONG'
    ? entryPrice + slDist * defaultRiskReward
    : entryPrice - slDist * defaultRiskReward;
}
