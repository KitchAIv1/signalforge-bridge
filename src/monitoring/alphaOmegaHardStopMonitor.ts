/**
 * ALPHAOMEGA hard-stop monitor — standalone, isolated to Lane B
 * (oanda_phase2_demo) trades only. Mirrors the amdTrailingStopMonitor.ts
 * pattern (own setInterval, own getSupabaseClient() call) rather than
 * hooking into the shared tradeMonitor/trailingStopMonitor loop, per the
 * audit's "high risk if you modify shared exit code" finding.
 *
 * Checks the latest M5 candle's high/low against each open Lane B
 * position's entry price; closes if adverse move >= HARD_STOP_PIPS. This
 * catches the exact failure mode found in research (Jun 30 -22.5p trade):
 * a slow price bleed with sparse opposing fires, which the fire-driven
 * opposing-count/backstop triggers (in alphaOmegaPositionTracking.ts) can't
 * see between fires.
 */

import { fetchLatestM5Candle } from '../connectors/oanda.js';
import { getSupabaseClient } from '../connectors/supabase.js';
import { pairToInstrument } from './trailingStopSupport.js';
import { logWarn } from '../utils/logger.js';
import {
  ALPHAOMEGA_CLOSE_HARD_STOP,
  HARD_STOP_PIPS,
  OMEGA_LANE_B_BROKER_ID,
  PIP_SIZE,
} from '../core/alphaOmega/alphaOmegaConstants.js';
import {
  closeAlphaOmegaPosition,
  loadOpenLaneBPositions,
  type AlphaOmegaPositionRow,
} from '../core/alphaOmega/alphaOmegaPositionTracking.js';

async function checkPositionHardStop(position: AlphaOmegaPositionRow, instrument: string): Promise<void> {
  if (position.entry_price == null) return;
  const candle = await fetchLatestM5Candle(instrument);
  if (!candle) return;

  const adversePips = position.direction === 'LONG'
    ? (position.entry_price - candle.low) / PIP_SIZE
    : (candle.high - position.entry_price) / PIP_SIZE;

  if (adversePips >= HARD_STOP_PIPS) {
    const supabase = getSupabaseClient();
    await closeAlphaOmegaPosition(supabase, position, ALPHAOMEGA_CLOSE_HARD_STOP);
  }
}

/** Currently AUD_USD only, matching the research window and Lane B's current instrument scope. */
const DEFAULT_INSTRUMENT = 'AUD_USD';

export async function runAlphaOmegaHardStopMonitor(): Promise<void> {
  const supabase = getSupabaseClient();
  let positions: AlphaOmegaPositionRow[];
  try {
    positions = await loadOpenLaneBPositions(supabase);
  } catch (err) {
    logWarn('[AlphaOmegaHardStop] loadOpenLaneBPositions failed — skipping cycle', { error: String(err) });
    return;
  }
  if (positions.length === 0) return;

  for (const position of positions) {
    try {
      const instrument = pairToInstrument(DEFAULT_INSTRUMENT);
      await checkPositionHardStop(position, instrument);
    } catch (err) {
      logWarn('[AlphaOmegaHardStop] checkPositionHardStop failed', {
        oandaTradeId: position.oanda_trade_id,
        error: String(err),
      });
    }
  }
}

export function isAlphaOmegaLaneBBroker(brokerId: string | null | undefined): boolean {
  return brokerId === OMEGA_LANE_B_BROKER_ID;
}
