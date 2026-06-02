/**
 * ScalperEngine — cron orchestrator for the AUD_USD price-ratchet scalper.
 *
 * IRON LAW 1: Never open a trade if day_stopped=true
 * IRON LAW 2: Never open more than one trade per M5 bar (5-min guard)
 * IRON LAW 3: SL hit = ALL positions closed immediately, day stops
 * IRON LAW 4: ratchet_count never exceeds SCALPER_MAX_RATCHETS
 * IRON LAW 5: reference_price never moves backward (against direction)
 * IRON LAW 6: Hard close at 16:00 regardless of open position P&L
 * IRON LAW 7: amd_outcome_tag never referenced — live fields only
 * IRON LAW 8: Units always calculated from live account balance
 *
 * Cron schedule (registered in src/index.ts):
 *   10:32, 10:37, 10:42 UTC → initializeDayState() (AMD detector runs at 10:31 UTC (cron '31 10 * * *'))
 *   every 30s → runMonitors()
 *   16:00 UTC → hardClose()
 */

import { closeTrade, fetchLatestM5Candle } from '../../connectors/oanda.js';
import { getSupabaseClient } from '../../connectors/supabase.js';
import { syncScalperTradeToBridgeLog } from './scalperBridgeSync.js';
import {
  loadOpenTrades,
  loadTodayDayState,
  loadTradeById,
  refreshDayNetPips,
  stopDay,
  updateTrade,
  upsertDayState,
} from './scalperDayState.js';
import { scalperError, scalperLog, scalperWarn } from './scalperLogger.js';
import { runEntryMonitor } from './scalperEntryMonitor.js';
import { runExitMonitor } from './scalperExitMonitor.js';
import {
  loadScalperConfig,
  pipsToPrice,
  signedPips,
  todayUtcString,
} from './scalperTypes.js';
import type { ScalperDirection } from './scalperTypes.js';

// ─── AGREE gate ──────────────────────────────────────────────────────────────

type AmdStateRow = {
  auto_direction: string | null;
  asian_close_bias_signal: string | null;
  amd_tag: string | null;
};

function isAgree(row: AmdStateRow): row is AmdStateRow & { auto_direction: ScalperDirection } {
  if (row.auto_direction !== 'long' && row.auto_direction !== 'short') return false;
  if (row.asian_close_bias_signal === 'BULLISH' && row.auto_direction === 'long') return true;
  if (row.asian_close_bias_signal === 'BEARISH' && row.auto_direction === 'short') return true;
  // NEUTRAL: no strong Asian close signal — auto_direction alone is sufficient
  // Backtest validated: 44 days, +2.95 net/trade, +299 gross pips/year
  if (row.asian_close_bias_signal === 'NEUTRAL') return true;
  return false;
}

async function fetchAmdStateForToday(tradeDate: string): Promise<AmdStateRow | null> {
  const { data, error } = await getSupabaseClient()
    .from('amd_state')
    .select('auto_direction, asian_close_bias_signal, amd_tag')
    .eq('pair', 'AUD_USD')
    .eq('trade_date', tradeDate)
    .maybeSingle();
  if (error) throw new Error(`fetchAmdState: ${error.message}`);
  return (data as AmdStateRow | null) ?? null;
}

// ─── initializeDayState ──────────────────────────────────────────────────────

export async function initializeDayState(): Promise<void> {
  // Issue F fix: runtime guard
  if (process.env.SCALPER_ENABLED !== 'true') return;

  const tradeDate = todayUtcString();
  const config = loadScalperConfig();

  // DB idempotency: if any row exists for today, initialization already ran or failed
  const existing = await loadTodayDayState(tradeDate, config.pair);
  if (existing) {
    scalperLog('initializeDayState: row exists — skipping', { tradeDate, stopReason: existing.stop_reason });
    return;
  }

  const amdRow = await fetchAmdStateForToday(tradeDate);

  if (!amdRow || !amdRow.auto_direction) {
    const now = new Date();
    const isLastRetry = now.getUTCHours() === 10 && now.getUTCMinutes() >= 16;
    if (isLastRetry) {
      scalperWarn('AMD state not ready by 10:16 UTC — day aborted', { tradeDate });
      await upsertDayState({
        trade_date: tradeDate,
        pair: config.pair,
        day_stopped: true,
        stop_reason: 'amd_not_ready',
      });
    } else {
      scalperLog('AMD state not ready — will retry next cron tick', { tradeDate });
    }
    return;
  }

  // IRON LAW 7: only live-detectable fields used here (no amd_outcome_tag)
  if (!isAgree(amdRow)) {
    scalperLog('Day gate BLOCKED — not AGREE. No trades today.', {
      auto_direction: amdRow.auto_direction,
      asian_close_bias_signal: amdRow.asian_close_bias_signal,
      tradeDate,
    });
    await upsertDayState({
      trade_date: tradeDate,
      pair: config.pair,
      direction: amdRow.auto_direction,
      amd_tag: amdRow.amd_tag ?? null,
      day_stopped: true,
      stop_reason: 'no_agree',
    });
    return;
  }

  // Fetch 10:00 UTC M5 candle for reference price
  const candle = await fetchLatestM5Candle(config.pair);
  if (!candle) {
    scalperWarn('Could not fetch 10:00 M5 candle — aborting initialization', { tradeDate });
    return;
  }

  const referencePrice = candle.close;
  const direction = amdRow.auto_direction;
  const triggerLevel = direction === 'long'
    ? referencePrice - pipsToPrice(config.pullbackPips)
    : referencePrice + pipsToPrice(config.pullbackPips);

  await upsertDayState({
    trade_date: tradeDate,
    pair: config.pair,
    direction,
    amd_tag: amdRow.amd_tag ?? null,
    reference_price: referencePrice,
    trigger_level: triggerLevel,
    ratchet_count: 0,
    day_stopped: false,
  });

  scalperLog('Day initialized', {
    direction,
    reference: referencePrice.toFixed(5),
    trigger: triggerLevel.toFixed(5),
    tradeDate,
  });
}

// ─── runMonitors ─────────────────────────────────────────────────────────────

export async function runMonitors(): Promise<void> {
  // Issue F fix: runtime guard
  if (process.env.SCALPER_ENABLED !== 'true') return;

  const config = loadScalperConfig();
  // Exit-before-entry: ratchet must update trigger_level before new entry check
  await runExitMonitor(config);
  await runEntryMonitor(config);
}

// ─── hardClose ───────────────────────────────────────────────────────────────

export async function hardClose(): Promise<void> {
  // IRON LAW 6: Hard close at 16:00 regardless of open position P&L
  const tradeDate = todayUtcString();
  const config = loadScalperConfig();

  const dayState = await loadTodayDayState(tradeDate, config.pair);
  if (!dayState || dayState.day_stopped) {
    scalperLog('Hard close skipped — day already stopped', {
      stop_reason: dayState?.stop_reason,
    });
    return;
  }

  const openTrades = await loadOpenTrades(tradeDate, config.pair);

  if (!openTrades.length) {
    await stopDay(tradeDate, 'hard_close', config.pair);
    scalperLog('Hard close — no open positions', { tradeDate });
    return;
  }

  // V7 fix: set day_stopped BEFORE closing trades
  // Prevents exit monitor from racing on the same trades
  await stopDay(tradeDate, 'hard_close', config.pair);

  for (const trade of openTrades) {
    if (!trade.oanda_trade_id) {
      scalperWarn('Open trade missing oanda_trade_id at hard close', { id: trade.id });
      continue;
    }
    try {
      const current = await loadTradeById(trade.id);
      if (current?.result != null) {
        scalperLog('Trade already closed — skipping', {
          id: trade.id,
          existingResult: current.result,
        });
        continue;
      }

      const closeResult = await closeTrade(trade.oanda_trade_id);
      const fillPrice = closeResult.orderFillTransaction?.price != null
        ? Number(closeResult.orderFillTransaction.price)
        : trade.entry_price;
      const pnl = signedPips(trade.entry_price, fillPrice, trade.direction as ScalperDirection);
      const closeFields = {
        result: 'timeout_16h' as const,
        exit_price: fillPrice,
        pnl_pips: pnl,
        pnl_pips_actual: pnl,
        closed_at: new Date().toISOString(),
        close_reason: 'hard_close_1600',
      };
      await updateTrade(trade.id, closeFields, tradeDate);
      const dayState = await loadTodayDayState(tradeDate, config.pair);
      if (dayState) {
        await syncScalperTradeToBridgeLog({ ...trade, ...closeFields }, dayState);
      }
      scalperLog('Hard closed trade', { id: trade.id, fillPrice, pnl, tradeDate });
    } catch (err) {
      scalperError('Hard close failed for trade', {
        id: trade.id,
        oandaTradeId: trade.oanda_trade_id,
        error: String(err),
      });
    }
  }

  // V7 fix: any trade that failed to close gets marked for retry
  const stillOpen = await loadOpenTrades(tradeDate, config.pair);
  for (const trade of stillOpen) {
    await updateTrade(trade.id, { result: 'force_flat_failed' }, tradeDate);
    scalperWarn('Trade not closed during hardClose — marked for retry', {
      id: trade.id,
      oandaTradeId: trade.oanda_trade_id,
    });
  }

  await refreshDayNetPips(tradeDate, config.pair);

  const finalDayState = await loadTodayDayState(tradeDate, config.pair);
  scalperLog('Hard close complete', { netPipsDay: finalDayState?.net_pips_day ?? 0, tradeDate });
}
