/**
 * AMD Distribution Engine — one dual-book decision per day at tag entry hour.
 * OANDA + VT fan out via submitAmdDualBook; exits via amdTrailingStopMonitor.
 */

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../connectors/supabase.js';
import { logInfo, logError } from '../utils/logger.js';
import { buildAmdDistributionOrderPlan } from './amd/buildAmdDistributionOrderPlan.js';
import { hasAmdEntryWorkRemaining } from './amd/hasAmdEntryWorkRemaining.js';
import { loadAmdAsianCloseFilterEnabled } from './amd/loadAmdAsianCloseFilterEnabled.js';
import { AMD_BROKER_ID } from './amd/resolveAmdOandaAccountId.js';
import { resolveAmdSizeMultiplier } from './amd/resolveAmdSizeMultiplier.js';
import { submitAmdDualBook } from './amd/submitAmdDualBook.js';

const TAG_ENTRY_HOUR: Record<string, number> = {
  AMD_COMPRESSION_BREAKOUT: 10,
  AMD_NONE: 10,
  AMD_FAILED: 11,
  AMD_TEXTBOOK: 12,
  AMD_SHIFTED: 12,
};

const TAGS_REQUIRING_AMD_CONFIRMED = new Set([
  'AMD_COMPRESSION_BREAKOUT',
  'AMD_NONE',
]);

const TAG_HARD_EXIT_HOUR: Record<string, number> = {
  AMD_NONE: 11,
  AMD_TEXTBOOK: 13,
  AMD_COMPRESSION_BREAKOUT: 16,
  AMD_FAILED: 16,
  AMD_SHIFTED: 16,
};

const TAG_TIME_GATE_HOUR: Record<string, number | null> = {
  AMD_NONE: 11,
};

const INSTRUMENT = 'AUD_USD';
const ENGINE_ID = 'engine_amd';

type AmdStateRow = Record<string, unknown>;
type TradeDirection = 'long' | 'short';

function supabaseDb(): SupabaseClient {
  return getSupabaseClient();
}

function isEnabled(): boolean {
  return process.env.AMD_DISTRIBUTION_ENABLED === 'true';
}

function utcNowParts(): { todayStr: string; hourUtc: number; minUtc: number } {
  const nowUtc = new Date();
  return {
    todayStr: nowUtc.toISOString().slice(0, 10),
    hourUtc: nowUtc.getUTCHours(),
    minUtc: nowUtc.getUTCMinutes(),
  };
}

function effectiveTag(amdRow: AmdStateRow): string {
  const overrideTag = amdRow.amd_tag_manual_override as string | null;
  return overrideTag ?? (amdRow.amd_tag as string);
}

function isEntryWindowOpen(tag: string, hourUtc: number, minUtc: number): boolean {
  const hardExit = TAG_HARD_EXIT_HOUR[tag] ?? 13;
  if (hourUtc >= hardExit) return false;
  if (TAGS_REQUIRING_AMD_CONFIRMED.has(tag)) {
    if (hourUtc === 10 && minUtc >= 31) return true;
    if (hourUtc === 10 && minUtc < 31) return false;
    return hourUtc > 10 && hourUtc < hardExit;
  }
  return hourUtc >= (TAG_ENTRY_HOUR[tag] ?? 12);
}

async function loadTodayAmdState(todayStr: string): Promise<AmdStateRow | null> {
  const { data, error } = await supabaseDb()
    .from('amd_state')
    .select(
      'amd_tag, amd_tag_manual_override, auto_direction, decision_auto_direction, daily_bias_alignment, ' +
        'layer4_d1_bias, evaluated_at, judas_direction, auto_direction_reason, ' +
        'amd_size_multiplier, reversal_confirmed, ' +
        'asian_close_bias_signal, asian_close_position_pct',
    )
    .eq('pair', INSTRUMENT)
    .eq('trade_date', todayStr)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as AmdStateRow;
}

async function hasBlockedToday(
  todayStr: string,
  blockReason: string,
): Promise<boolean> {
  const { count, error } = await supabaseDb()
    .from('bridge_trade_log')
    .select('id', { count: 'exact', head: true })
    .eq('engine_id', ENGINE_ID)
    .eq('decision', 'BLOCKED')
    .eq('block_reason', blockReason)
    .gte('created_at', `${todayStr}T00:00:00Z`);
  if (error) {
    console.error(`[AmdDistribution] hasBlockedToday error: ${error.message}`);
    return false;
  }
  return (count ?? 0) > 0;
}

async function loadEngineRow(): Promise<{ is_active: boolean; weight: number } | null> {
  const { data } = await supabaseDb()
    .from('bridge_engines')
    .select('is_active, weight')
    .eq('engine_id', ENGINE_ID)
    .maybeSingle();
  return data as { is_active: boolean; weight: number } | null;
}

async function isNewsBlackout(): Promise<boolean> {
  const windowStart = new Date(Date.now() - 90 * 60 * 1000).toISOString();
  const windowEnd = new Date(Date.now() + 90 * 60 * 1000).toISOString();
  const { count } = await supabaseDb()
    .from('news_events')
    .select('id', { count: 'exact', head: true })
    .contains('affected_pairs', [INSTRUMENT])
    .gte('event_datetime_utc', windowStart)
    .lte('event_datetime_utc', windowEnd);
  return (count ?? 0) > 0;
}

async function writeBlockedLog(
  reason: string,
  tag: string,
  amdRow: AmdStateRow,
  stopLoss: number,
  direction: string,
): Promise<void> {
  const { error } = await supabaseDb().from('bridge_trade_log').insert({
    signal_id: randomUUID(),
    engine_id: ENGINE_ID,
    broker_id: AMD_BROKER_ID,
    pair: INSTRUMENT,
    direction,
    stop_loss: stopLoss,
    signal_received_at: new Date().toISOString(),
    decision: 'BLOCKED',
    block_reason: reason,
    status: 'pending',
    amd_tag: tag,
    amd_evaluated_at: amdRow.evaluated_at,
    layer4_d1_bias: amdRow.layer4_d1_bias,
    daily_bias_alignment: amdRow.daily_bias_alignment,
  });
  if (error) {
    logError('[AmdDistribution] BLOCKED log insert failed', {
      reason,
      error: error.message,
    });
  }
}

async function runExecution(
  tag: string,
  direction: TradeDirection,
  amdRow: AmdStateRow,
  weight: number,
  todayStr: string,
): Promise<void> {
  const sizeMultiplier = resolveAmdSizeMultiplier(amdRow.amd_size_multiplier);
  const plan = await buildAmdDistributionOrderPlan(direction, weight, sizeMultiplier);
  if (!plan) return;
  const exitStrategy = tag === 'AMD_NONE' ? 'S1' : plan.exitStrategy;
  await submitAmdDualBook({
    supabase: supabaseDb(),
    tag,
    direction,
    amdRow,
    plan,
    exitStrategy,
    todayStr,
    timeGateUtcHour: TAG_TIME_GATE_HOUR[tag] ?? null,
  });
}

async function passesExecutionGates(
  tag: string,
  amdRow: AmdStateRow,
  todayStr: string,
  hourUtc: number,
  minUtc: number,
): Promise<{ ok: true; direction: TradeDirection; weight: number } | { ok: false }> {
  const autoDirection = (amdRow.decision_auto_direction ?? amdRow.auto_direction) as string | null;
  if (autoDirection !== 'long' && autoDirection !== 'short') {
    logInfo('[AmdDistribution] auto_direction neutral — no trade today', { autoDirection });
    return { ok: false };
  }
  if (await loadAmdAsianCloseFilterEnabled(supabaseDb())) {
    const biasSignal = amdRow.asian_close_bias_signal as string | null;
    if (biasSignal !== null && biasSignal !== 'NEUTRAL') {
      const biasDirection = biasSignal === 'BULLISH' ? 'long' : 'short';
      if (biasDirection !== autoDirection) {
        const biasPct = amdRow.asian_close_position_pct as number | null;
        const blockReason =
          `ASIAN_CLOSE_DISAGREE: auto=${autoDirection} bias=${biasSignal} pct=${biasPct ?? 'null'}`;
        if (!(await hasBlockedToday(todayStr, blockReason))) {
          logInfo(`[AmdDistribution] BLOCKED ${blockReason}`);
          await writeBlockedLog(blockReason, tag, amdRow, 0.635, autoDirection.toUpperCase());
        }
        return { ok: false };
      }
    }
  }
  if (!isEntryWindowOpen(tag, hourUtc, minUtc)) return { ok: false };
  const evaluatedAt = new Date(amdRow.evaluated_at as string);
  if (evaluatedAt.toISOString().slice(0, 10) !== todayStr) {
    logInfo('[AmdDistribution] amd_state not evaluated today — skipping');
    return { ok: false };
  }
  if (!(await hasAmdEntryWorkRemaining(supabaseDb(), todayStr))) {
    logInfo('[AmdDistribution] All enabled venues already EXECUTED today — skipping');
    return { ok: false };
  }
  const engineRow = await loadEngineRow();
  if (!engineRow?.is_active) {
    logInfo('[AmdDistribution] engine_amd is_active=false — BLOCKED');
    await writeBlockedLog('ENGINE_INACTIVE', tag, amdRow, 0.635, autoDirection.toUpperCase());
    return { ok: false };
  }
  if (await isNewsBlackout()) {
    logInfo('[AmdDistribution] News blackout window — BLOCKED');
    await writeBlockedLog('NEWS_WINDOW', tag, amdRow, 0.635, autoDirection.toUpperCase());
    return { ok: false };
  }
  return { ok: true, direction: autoDirection, weight: engineRow.weight };
}

export class AmdDistributionEngine {
  static async checkAndExecute(): Promise<void> {
    if (!isEnabled()) return;
    const { todayStr, hourUtc, minUtc } = utcNowParts();
    const amdRow = await loadTodayAmdState(todayStr);
    if (!amdRow) {
      logInfo('[AmdDistribution] No amd_state for today — skipping', { todayStr });
      return;
    }
    const tag = effectiveTag(amdRow);
    if (!tag || !(tag in TAG_ENTRY_HOUR)) {
      logInfo('[AmdDistribution] Tag not tradeable', { tag });
      return;
    }
    const gate = await passesExecutionGates(tag, amdRow, todayStr, hourUtc, minUtc);
    if (!gate.ok) return;
    try {
      await runExecution(tag, gate.direction, amdRow, gate.weight, todayStr);
    } catch (execErr) {
      logError('[AmdDistribution] Execution error', { err: String(execErr) });
    }
  }
}
