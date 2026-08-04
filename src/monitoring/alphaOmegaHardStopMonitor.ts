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

import { fetchLatestM5Candle, type LatestM5Candle } from '../connectors/oanda.js';
import { getSupabaseClient } from '../connectors/supabase.js';
import { pairToInstrument } from './trailingStopSupport.js';
import { logInfo, logWarn } from '../utils/logger.js';
import {
  ALPHAOMEGA_CLOSE_HARD_STOP,
  HARD_STOP_PIPS,
  isOmegaLaneBBroker,
  PIP_SIZE,
} from '../core/alphaOmega/alphaOmegaConstants.js';
import {
  evaluateDeadCrackAbort,
  formatDeadCrackAdvisory,
  isAlphaOmegaDeadCrackAbortEnabled,
} from '../core/alphaOmega/alphaOmegaDeadCrackAbort.js';
import {
  evaluateGivebackTrail,
  isAlphaOmegaGivebackTrailEnabled,
} from '../core/alphaOmega/alphaOmegaGivebackTrail.js';
import {
  closeAlphaOmegaPosition,
  loadOpenLaneBPositions,
  updatePeakFavorablePips,
  updateTroughAdversePips,
  type AlphaOmegaPositionRow,
} from '../core/alphaOmega/alphaOmegaPositionTracking.js';

/**
 * Checks the price-based exits for one open Lane B position, in priority
 * order: hard stop first (unchanged), then the peak-favorable-giveback trail
 * (when enabled), then — only if nothing above closed it — the dead-crack
 * abort (kill-switched; shadow-logs would_abort while OFF). Reuses the single
 * already-fetched candle for all checks; later checks are purely additive and
 * never run before or instead of an earlier one.
 */
async function checkPositionHardStop(
  position: AlphaOmegaPositionRow,
  instrument: string,
  givebackTrailEnabled: boolean,
  deadCrackAbortEnabled: boolean,
): Promise<void> {
  if (position.entry_price == null) return;
  const candle = await fetchLatestM5Candle(instrument);
  if (!candle) return;

  const adversePips = position.direction === 'LONG'
    ? (position.entry_price - candle.low) / PIP_SIZE
    : (candle.high - position.entry_price) / PIP_SIZE;

  const supabase = getSupabaseClient();
  if (adversePips >= HARD_STOP_PIPS) {
    await closeAlphaOmegaPosition(supabase, position, ALPHAOMEGA_CLOSE_HARD_STOP);
    return;
  }

  if (givebackTrailEnabled) {
    const trail = evaluateGivebackTrail(
      { direction: position.direction, entryPrice: position.entry_price, peakFavorablePips: position.peak_favorable_pips },
      candle,
    );
    if (trail.shouldExit && trail.exitReason) {
      await closeAlphaOmegaPosition(supabase, position, trail.exitReason);
      return;
    }
    if (trail.nextPeakFavorablePips !== position.peak_favorable_pips) {
      await updatePeakFavorablePips(supabase, position.oanda_trade_id, trail.nextPeakFavorablePips);
    }
  }

  await checkDeadCrackAbort(position, candle, givebackTrailEnabled, deadCrackAbortEnabled);
}

/** Shadow would_abort logged once per position — avoids one line per 30s cycle on a dead trade. */
const deadCrackShadowLoggedTradeIds = new Set<string>();

/**
 * Dead-crack abort check — LAST in the exit priority chain. Always maintains
 * the running trough (and the peak when the trail isn't doing it) so the
 * path extremes stay truthful whether or not the abort switch is on.
 */
async function checkDeadCrackAbort(
  position: AlphaOmegaPositionRow,
  candle: LatestM5Candle,
  givebackTrailEnabled: boolean,
  deadCrackAbortEnabled: boolean,
): Promise<void> {
  if (position.entry_price == null) return;
  const supabase = getSupabaseClient();
  const abort = evaluateDeadCrackAbort(
    {
      direction: position.direction,
      entryPrice: position.entry_price,
      entryFiredAt: position.entry_fired_at,
      peakFavorablePips: position.peak_favorable_pips,
      troughAdversePips: position.trough_adverse_pips ?? 0,
    },
    candle,
  );

  if (abort.nextTroughAdversePips > (position.trough_adverse_pips ?? 0)) {
    await updateTroughAdversePips(supabase, position.oanda_trade_id, abort.nextTroughAdversePips);
  }
  if (!givebackTrailEnabled && abort.nextPeakFavorablePips > position.peak_favorable_pips) {
    await updatePeakFavorablePips(supabase, position.oanda_trade_id, abort.nextPeakFavorablePips);
  }

  if (!abort.shouldAbort || abort.abortReason == null) return;

  if (!deadCrackAbortEnabled) {
    if (!deadCrackShadowLoggedTradeIds.has(position.oanda_trade_id)) {
      deadCrackShadowLoggedTradeIds.add(position.oanda_trade_id);
      logInfo('[AlphaOmega] dead-crack would_abort (kill switch OFF)', {
        oandaTradeId: position.oanda_trade_id,
        brokerId: position.broker_id,
        advisory: formatDeadCrackAdvisory(abort, 'would_abort'),
      });
    }
    return;
  }

  logInfo('[AlphaOmega] dead-crack ABORT (kill switch ON)', {
    oandaTradeId: position.oanda_trade_id,
    brokerId: position.broker_id,
    advisory: formatDeadCrackAdvisory(abort, 'abort'),
  });
  await closeAlphaOmegaPosition(supabase, position, abort.abortReason);
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

  // Read once per cycle (not once per position) — cheap either way today since
  // Lane B holds at most one open position, but correct regardless.
  const givebackTrailEnabled = await isAlphaOmegaGivebackTrailEnabled(supabase);
  const deadCrackAbortEnabled = await isAlphaOmegaDeadCrackAbortEnabled(supabase);

  for (const position of positions) {
    try {
      const instrument = pairToInstrument(DEFAULT_INSTRUMENT);
      await checkPositionHardStop(position, instrument, givebackTrailEnabled, deadCrackAbortEnabled);
    } catch (err) {
      logWarn('[AlphaOmegaHardStop] checkPositionHardStop failed', {
        oandaTradeId: position.oanda_trade_id,
        error: String(err),
      });
    }
  }
}

export function isAlphaOmegaLaneBBroker(brokerId: string | null | undefined): boolean {
  return isOmegaLaneBBroker(brokerId);
}
