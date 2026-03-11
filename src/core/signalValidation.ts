/**
 * Pre-pipeline validation: engineId, pair, direction, SL, confluence, zero distance, TP fallback.
 * Each validator returns null if pass, or block reason string.
 */

import type { SignalInsertPayload } from '../connectors/supabase.js';
import { toOandaInstrument, isValidInstrument } from '../utils/pairs.js';

export interface ValidationResult {
  pass: boolean;
  reason?: string;
  normalized?: {
    engineId: string;
    pair: string;
    oandaInstrument: string;
    direction: 'LONG' | 'SHORT';
    confluenceScore: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    slPipsFromSignal: number | null;
    createdAt: string;
  };
}

function getEngineId(payload: SignalInsertPayload): string | null {
  const id = payload.engine_id ?? payload.provider_id ?? (payload as Record<string, unknown>).engineId;
  if (id == null || String(id).trim() === '') return null;
  return String(id).trim().toLowerCase();
}

function getDirection(payload: SignalInsertPayload): 'LONG' | 'SHORT' | null {
  const d = (payload.direction ?? '').toString().toUpperCase();
  if (d === 'LONG' || d === 'BUY') return 'LONG';
  if (d === 'SHORT' || d === 'SELL') return 'SHORT';
  return null;
}

function getEntryPrice(payload: SignalInsertPayload): number | null {
  const low = payload.entry_zone_low != null ? Number(payload.entry_zone_low) : NaN;
  const high = payload.entry_zone_high != null ? Number(payload.entry_zone_high) : NaN;
  if (!Number.isNaN(low) && !Number.isNaN(high)) return (low + high) / 2;
  if (!Number.isNaN(low)) return low;
  if (!Number.isNaN(high)) return high;
  return null;
}

export function validateSignal(
  payload: SignalInsertPayload,
  defaultRiskReward: number
): ValidationResult {
  const engineId = getEngineId(payload);
  if (!engineId) return { pass: false, reason: 'Signal missing engine_id' };

  const pair = (payload.pair ?? '').toString().trim();
  if (!pair) return { pass: false, reason: 'Pair missing' };
  const oandaInstrument = toOandaInstrument(pair);
  if (!isValidInstrument(pair)) return { pass: false, reason: `Invalid instrument: ${pair}` };

  const direction = getDirection(payload);
  if (!direction) return { pass: false, reason: `Invalid direction: ${payload.direction}` };

  const stopLoss = payload.stop_loss != null ? Number(payload.stop_loss) : NaN;
  if (Number.isNaN(stopLoss) || payload.stop_loss == null) return { pass: false, reason: 'No stop-loss provided' };

  const confluenceScore = payload.confluence_score != null ? Number(payload.confluence_score) : NaN;
  if (Number.isNaN(confluenceScore) || confluenceScore <= 0) return { pass: false, reason: 'Invalid confluence score' };

  const entryPrice = getEntryPrice(payload);
  if (entryPrice == null) return { pass: false, reason: 'Entry price missing (entry_zone_low/high both null)' };
  if (direction === 'LONG' && stopLoss >= entryPrice) return { pass: false, reason: 'Stop-loss is in wrong direction' };
  if (direction === 'SHORT' && stopLoss <= entryPrice) return { pass: false, reason: 'Stop-loss is in wrong direction' };
  if (Math.abs(entryPrice - stopLoss) < 1e-10) return { pass: false, reason: 'Stop-loss distance is zero' };

  let takeProfit: number;
  if (payload.target_1 != null && !Number.isNaN(Number(payload.target_1))) {
    takeProfit = Number(payload.target_1);
  } else if (payload.take_profit != null && !Number.isNaN(Number(payload.take_profit))) {
    takeProfit = Number(payload.take_profit);
  } else {
    const slDist = Math.abs(entryPrice - stopLoss);
    takeProfit = direction === 'LONG' ? entryPrice + slDist * defaultRiskReward : entryPrice - slDist * defaultRiskReward;
  }

  const slPipsFromSignal = payload.stop_loss_pips != null && !Number.isNaN(Number(payload.stop_loss_pips))
    ? Number(payload.stop_loss_pips)
    : null;

  const createdAt = (payload.created_at ?? new Date().toISOString()).toString();

  return {
    pass: true,
    normalized: {
      engineId,
      pair,
      oandaInstrument,
      direction,
      confluenceScore,
      entryPrice,
      stopLoss,
      takeProfit,
      slPipsFromSignal,
      createdAt,
    },
  };
}
