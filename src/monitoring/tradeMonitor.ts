/**
 * Every 30s: sync open trades with OANDA; close if past max_hold_hours; update bridge_trade_log.
 * On close: writes exit_price, pnl_dollars, result (win/loss/breakeven), closed_at, duration_minutes.
 *
 * P0 fix: Do not mark a trade closed when it's absent from OANDA open list if it was opened
 * very recently. OANDA can have a brief propagation lag before a newly filled trade appears.
 * Minimum age guard prevents false "closed" for trades like EUR_JPY 76 (2026-03-12).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getOpenTrades } from '../connectors/oanda.js';
import { recordClosedTrade } from '../core/circuitBreaker.js';
import type { BridgeEngineRow } from '../types/config.js';
import { resolveBrokerForLogRow } from '../services/broker/resolveBrokerForLogRow.js';
import { buildBrokerOpenTradeIndex, openIdsForLogRow } from './brokerOpenTradeIndex.js';
import {
  closeTradeViaBroker,
  fetchClosedTradeSnapshotViaBroker,
} from './brokerTradeLifecycle.js';
import { computeDerivedFields, resultFromPnl } from './tradeMonitorHelpers.js';
import {
  cleanupOrphanedTrailStates,
  closeTrailStop,
  ensureTrailStopState,
  isTrailStopEngine,
  runTrailingStopCheck,
} from './trailingStopMonitor.js';
import { getTrailEnabled } from './trailingStopSupport.js';
import {
  cleanupOrphanedTp2FloorStates,
  closeTp2FloorLeg,
  ensureTp2FloorState,
  isOmegaTp2FloorLeg,
  runTp2FloorCheck,
} from './omegaTp2FloorMonitor.js';
import {
  deleteTp2FloorState,
  getOmegaTp2FloorEnabled,
  inferOmegaTp2CloseReason,
} from './omegaTp2FloorSupport.js';
import { runNewsAutoDetect } from '../utils/newsAutoDetect.js';
import { fetchCloseCandles } from './closeCandleCapture.js';
import { runPipThresholdMonitor } from './pipThresholdMonitor.js';
import { finalizeOpenLogRowClose } from './tradeMonitorFinalizeClose.js';
import { normalizeBrokerTimestamp } from '../connectors/broker/normalizeBrokerTimestamp.js';

/** Do not infer "closed" from absent open list if trade age < this (OANDA propagation lag). */
const MIN_OPEN_AGE_MS = 60_000;

let newsDetectCycleCount = 0;
let consecutiveOandaMonitorFailures = 0;

function durationMinutes(signalReceivedAt: string, closedAt: string): number | null {
  const a = new Date(signalReceivedAt).getTime();
  const b = new Date(closedAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 60000 * 100) / 100;
}

export async function runTradeMonitor(
  supabase: SupabaseClient,
  engines: BridgeEngineRow[],
  maxHoldHours: number = 4
): Promise<void> {
  newsDetectCycleCount += 1;
  if (newsDetectCycleCount % 10 === 0) {
    await runNewsAutoDetect(supabase).catch((runErr) =>
      console.error('[NewsAutoDetect] failed:', String(runErr))
    );
  }

  let oandaTrades: Awaited<ReturnType<typeof getOpenTrades>>;
  try {
    oandaTrades = await getOpenTrades();
    consecutiveOandaMonitorFailures = 0;
  } catch (err) {
    consecutiveOandaMonitorFailures += 1;
    console.error(
      `[TradeMonitor] getOpenTrades failed (${consecutiveOandaMonitorFailures} consecutive) — skipping cycle:`,
      String(err)
    );
    if (consecutiveOandaMonitorFailures >= 5) {
      console.error('[TradeMonitor] 5 consecutive OANDA failures — forcing restart for clean reconnect');
      process.exit(1);
    }
    return;
  }

  if (getTrailEnabled()) {
    await cleanupOrphanedTrailStates(supabase);
  }
  if (getOmegaTp2FloorEnabled()) {
    await cleanupOrphanedTp2FloorStates(supabase);
  }

  const { data: logOpen } = await supabase
    .from('bridge_trade_log')
    .select(
      'id, oanda_trade_id, engine_id, broker_id, signal_received_at, pair, direction, fill_price, stop_loss, units, entry_price, leg_type, take_profit'
    )
    .eq('status', 'open')
    .not('oanda_trade_id', 'is', null);

  const openTradeIndex = await buildBrokerOpenTradeIndex(supabase, logOpen ?? []);

  const engineById = new Map(engines.map((e) => [e.engine_id, e]));

  for (const row of logOpen ?? []) {
    if ((row.engine_id as string) === 'engine_amd') {
      continue;
    }
    const tid = row.oanda_trade_id as string;
    const brokerId = row.broker_id as string | null | undefined;
    const venueOpenIds = openIdsForLogRow(openTradeIndex, brokerId);
    const openTime = row.signal_received_at as string;
    const engine = engineById.get(row.engine_id as string);
    const maxHold = (engine?.max_hold_hours ?? maxHoldHours) * 60 * 60 * 1000;
    const elapsed = Date.now() - new Date(openTime).getTime();

    if (!venueOpenIds.has(tid)) {
      if (elapsed < MIN_OPEN_AGE_MS) continue;
      const broker = await resolveBrokerForLogRow(
        supabase,
        brokerId,
        row.engine_id as string,
      );
      const details = await fetchClosedTradeSnapshotViaBroker(broker, tid, openTime);
      if (!details.closedTime && broker.brokerType !== 'oanda') continue;
      if (broker.brokerType === 'oanda' && details.closedTime == null && details.exitPrice == null) {
        continue;
      }
      const closedAt = normalizeBrokerTimestamp(details.closedTime ?? new Date());
      const exitPriceNum = details.exitPrice;
      const derived = computeDerivedFields(row, exitPriceNum, details.pnlDollars);
      const legType = row.leg_type as string | null;
      const storedTakeProfit = row.take_profit as number | null;
      let closeReason: string | undefined;
      if (legType === 'tp1' && storedTakeProfit != null && exitPriceNum != null) {
        const tolerance = 0.00005;
        closeReason =
          Math.abs(exitPriceNum - storedTakeProfit) <= tolerance
            ? 'tp_hit'
            : 'external_close';
      } else if (
        legType === 'tp2' &&
        exitPriceNum != null &&
        typeof row.fill_price === 'number'
      ) {
        closeReason = inferOmegaTp2CloseReason(
          exitPriceNum,
          row.fill_price as number,
          row.direction as string,
          row.pair as string,
          storedTakeProfit,
        );
      }
      if (legType === 'tp2') {
        await deleteTp2FloorState(supabase, tid);
      }
      const update: Record<string, unknown> = {
        status: 'closed',
        closed_at: closedAt,
        exit_price: exitPriceNum,
        pnl_dollars: details.pnlDollars,
        result: resultFromPnl(details.pnlDollars),
        duration_minutes: durationMinutes(openTime, closedAt),
        ...(closeReason && { close_reason: closeReason }),
        ...derived,
      };
      if ((row.engine_id as string) === 'omega') {
        const { intraTradeCandles, postExitCandles } = await fetchCloseCandles(
          row.pair as string,
          openTime,
          closedAt
        );
        if (intraTradeCandles.length > 0) update.intra_trade_candles = intraTradeCandles;
        if (postExitCandles.length > 0)   update.post_exit_candles   = postExitCandles;
      }
      await finalizeOpenLogRowClose(
        supabase,
        row.id as string,
        update,
        {
          engineId: (row.engine_id as string) ?? 'unknown',
          instrument: (row.pair as string) ?? 'AUD_USD',
          direction: (row.direction as string) ?? 'unknown',
          entryPrice: typeof row.fill_price === 'number' ? row.fill_price : 0,
          exitPrice: exitPriceNum ?? 0,
          pnlPips: typeof derived.pnl_pips === 'number' ? derived.pnl_pips : 0,
          pnlDollars: details.pnlDollars ?? 0,
          closeReason: closeReason ?? 'external_close',
          durationMinutes: durationMinutes(openTime, closedAt) ?? 0,
        },
        details.pnlDollars,
      );
      continue;
    }
    if (elapsed >= maxHold) {
      const broker = await resolveBrokerForLogRow(
        supabase,
        brokerId,
        row.engine_id as string,
      );
      const { closedAt: rawClosedAt, pnlDollars, exitPriceNum } = await closeTradeViaBroker(broker, tid);
      const closedAt = normalizeBrokerTimestamp(rawClosedAt);
      const derived = computeDerivedFields(row, exitPriceNum, pnlDollars);
      const update: Record<string, unknown> = {
        status: 'closed',
        close_reason: 'max_hold',
        closed_at: closedAt,
        exit_price: exitPriceNum,
        pnl_dollars: pnlDollars,
        result: resultFromPnl(pnlDollars),
        duration_minutes: durationMinutes(openTime, closedAt),
        ...derived,
      };
      if ((row.engine_id as string) === 'omega') {
        const { intraTradeCandles, postExitCandles } = await fetchCloseCandles(
          row.pair as string,
          openTime,
          closedAt
        );
        if (intraTradeCandles.length > 0) update.intra_trade_candles = intraTradeCandles;
        if (postExitCandles.length > 0)   update.post_exit_candles   = postExitCandles;
      }
      if ((row.leg_type as string | null) === 'tp2') {
        await deleteTp2FloorState(supabase, tid);
      }
      await finalizeOpenLogRowClose(
        supabase,
        row.id as string,
        update,
        {
          engineId: (row.engine_id as string) ?? 'unknown',
          instrument: (row.pair as string) ?? 'AUD_USD',
          direction: (row.direction as string) ?? 'unknown',
          entryPrice: typeof row.fill_price === 'number' ? row.fill_price : 0,
          exitPrice: exitPriceNum ?? 0,
          pnlPips: typeof derived.pnl_pips === 'number' ? derived.pnl_pips : 0,
          pnlDollars: pnlDollars ?? 0,
          closeReason: 'max_hold',
          durationMinutes: durationMinutes(openTime, closedAt) ?? 0,
        },
        pnlDollars,
      );
      continue;
    }

    const legType = row.leg_type as string | null;
    if (isOmegaTp2FloorLeg(row.engine_id as string, legType) && venueOpenIds.has(tid)) {
      const logRow = row as Record<string, unknown>;
      await ensureTp2FloorState(supabase, logRow);
      const floorDecision = await runTp2FloorCheck(supabase, logRow, tid);
      if (floorDecision.shouldClose) {
        await closeTp2FloorLeg(supabase, tid, row.id as string, logRow, floorDecision.reason);
        continue;
      }
    }

    const isTrailEligibleLeg = legType === null || legType === 'trail';
    if (isTrailStopEngine(row.engine_id as string) && isTrailEligibleLeg && venueOpenIds.has(tid)) {
      const logRow = row as Record<string, unknown>;
      await ensureTrailStopState(supabase, logRow);
      const trail = await runTrailingStopCheck(supabase, logRow, tid);
      if (trail.shouldClose) {
        await closeTrailStop(supabase, tid, row.id as string, logRow, trail.reason);
        continue;
      }
    }
  }

  const openRows = (logOpen ?? [])
    .filter((r) => r.oanda_trade_id && r.fill_price && r.direction && r.pair)
    .map((r) => ({
      oanda_trade_id: r.oanda_trade_id as string,
      engine_id: r.engine_id as string,
      pair: r.pair as string,
      direction: r.direction as string,
      fill_price: r.fill_price as number,
    }));
  void runPipThresholdMonitor(openRows).catch(() => {});
}
