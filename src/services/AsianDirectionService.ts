/**
 * Asian Direction automation — sets prior-day AMD flags at 21:10 UTC,
 * closes Omega positions at 08:00 UTC Asian session end.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../connectors/supabase.js';
import { closeAllOpenOmegaPositions } from './omegaClosePositions.js';
import { sendAsianCloseAlert } from './telegram/alertAsianSession.js';
import { logAsianDirectionRow } from './asianDirection/logAsianDirection.js';
import type {
  AsianDirectionAction,
  AsianDirectionLogRow,
  AsianDirectionTriggerType,
} from './asianDirection/types.js';
import {
  computeD1MomentumSignal,
  fetchPriorD1Context,
} from './asianDirection/d1ContextHelpers.js';
import {
  getBridgeConfigValue,
  setBridgeConfigValues,
  writeBridgeConfigKey,
} from './asianDetection/bridgeConfigHelpers.js';
import { logAsianSessionDetection } from './asianDetection/logAsianSessionDetection.js';
import { nextAsianSessionExpiry } from './asianDirection/asianSessionExpiry.js';
import { logInfo } from '../utils/logger.js';

// Backtest source: 42-day retroactive simulation, clean prior-day join
// AMD_FAILED prior → 61.5% SHORT in next Asian session (n=13)
// AMD_SHIFTED prior → coin flip (n=16) — no edge
// Other tags → insufficient data or coin flip
const PRIOR_BIAS_MAP: Record<string, 'long' | 'short' | 'neutral'> = {
  AMD_FAILED: 'short',
  AMD_SHIFTED: 'neutral',
  AMD_COMPRESSION_BREAKOUT: 'neutral',
  AMD_NONE: 'neutral',
  AMD_TEXTBOOK: 'short',  // 57.9% SHORT next Asian session (n=38, 287-day clean backtest)
} as const;

function utcTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Resolves the correct date to use for amd_state lookups.
 * amd_state only has rows for trading days (Mon–Fri).
 * On Sunday at 21:10 UTC (Asian open), use Friday's date instead.
 */
export function resolveAmdLookupDate(todayUtc: string): { lookupDate: string; isWeekendFallback: boolean } {
  const d = new Date(`${todayUtc}T21:00:00.000Z`);
  const dayOfWeek = d.getUTCDay();

  if (dayOfWeek === 0) {
    const friday = new Date(d);
    friday.setUTCDate(friday.getUTCDate() - 2);
    return {
      lookupDate: friday.toISOString().slice(0, 10),
      isWeekendFallback: true,
    };
  }

  if (dayOfWeek === 6) {
    const friday = new Date(d);
    friday.setUTCDate(friday.getUTCDate() - 1);
    return {
      lookupDate: friday.toISOString().slice(0, 10),
      isWeekendFallback: true,
    };
  }

  return { lookupDate: todayUtc, isWeekendFallback: false };
}

function emptyLogFields(
  todayUtc: string,
  triggerType: AsianDirectionTriggerType,
): AsianDirectionLogRow {
  return {
    trade_date: todayUtc,
    triggered_at: new Date().toISOString(),
    trigger_type: triggerType,
    amd_tag: null,
    prior_d1_direction: null,
    prior_d1_body_pips: null,
    prior_d1_close: null,
    direction_set: null,
    previous_direction: null,
    direction_changed: null,
    action: 'SKIPPED_NO_AMD',
    reason: '',
    positions_closed: null,
    asian_session_result: null,
  };
}

async function fetchAmdTagForDate(
  supabase: SupabaseClient,
  lookupDate: string,
): Promise<{ amdTag: string | null; error: boolean }> {
  try {
    const { data, error } = await supabase
      .from('amd_state')
      .select('amd_tag')
      .eq('trade_date', lookupDate)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[AsianDirection] amd_state query failed:', error.message);
      return { amdTag: null, error: true };
    }

    return { amdTag: data?.amd_tag != null ? String(data.amd_tag) : null, error: false };
  } catch (queryErr: unknown) {
    console.error('[AsianDirection] amd_state query error:', String(queryErr));
    return { amdTag: null, error: true };
  }
}

function computeTomorrowUtc(): string {
  const cursor = new Date();
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  return cursor.toISOString().slice(0, 10);
}

async function logD1FallbackDetection(
  supabase: SupabaseClient,
  tomorrowUtc: string,
  action: string,
  amdTag: string,
  priorDirectionBias: string,
  extras: {
    direction_set?: string | null;
    valid_until?: string | null;
    evaluated_direction?: string | null;
    evaluated_net_pips?: number | null;
  } = {},
): Promise<void> {
  await logAsianSessionDetection(supabase, {
    trade_date: tomorrowUtc,
    condition_check_time: '21:10',
    action,
    prior_amd_tag: amdTag,
    prior_direction_bias: priorDirectionBias,
    ...extras,
  });
}

function passesStrongD1Gate(
  d1BodyPct: number,
  d1ClosePct: number,
  d1Direction: string | null,
  priorDirectionBias: string,
): boolean {
  return (
    d1BodyPct >= 60 &&
    d1ClosePct <= 20 &&
    d1Direction === priorDirectionBias &&
    d1Direction !== 'equal'
  );
}

async function readPriorD1BridgeConfig(supabase: SupabaseClient): Promise<{
  d1Direction: string | null;
  d1BodyPct: number;
  d1ClosePct: number;
  d1NetPips: number;
}> {
  const [directionStr, bodyPctStr, closePosPctStr, netPipsStr] = await Promise.all([
    getBridgeConfigValue(supabase, 'd1_prior_direction'),
    getBridgeConfigValue(supabase, 'd1_prior_body_pct'),
    getBridgeConfigValue(supabase, 'd1_prior_close_pos_pct'),
    getBridgeConfigValue(supabase, 'd1_prior_net_pips'),
  ]);

  return {
    d1Direction: directionStr,
    d1BodyPct: parseFloat(bodyPctStr ?? '0'),
    d1ClosePct: parseFloat(closePosPctStr ?? '100'),
    d1NetPips: parseFloat(netPipsStr ?? '0'),
  };
}

async function skipD1FallbackManualMode(
  supabase: SupabaseClient,
  tomorrowUtc: string,
  amdTag: string,
  priorDirectionBias: string,
): Promise<boolean> {
  const directionMode = await getBridgeConfigValue(supabase, 'direction_mode');
  if (directionMode !== 'manual') return false;

  console.log('[AsianDirection] D1_FALLBACK skipped — direction_mode=manual');
  await logD1FallbackDetection(
    supabase,
    tomorrowUtc,
    'D1_FALLBACK_SKIPPED_MANUAL',
    amdTag,
    priorDirectionBias,
  );
  return true;
}

async function skipD1FallbackNonFailedTag(
  supabase: SupabaseClient,
  tomorrowUtc: string,
  amdTag: string,
  priorDirectionBias: string,
): Promise<boolean> {
  if (amdTag === 'AMD_FAILED') return false;

  await logD1FallbackDetection(
    supabase,
    tomorrowUtc,
    'D1_FALLBACK_SKIPPED_TAG',
    amdTag,
    priorDirectionBias,
  );
  return true;
}

async function skipD1FallbackWeakD1(
  supabase: SupabaseClient,
  tomorrowUtc: string,
  amdTag: string,
  priorDirectionBias: string,
  priorD1: Awaited<ReturnType<typeof readPriorD1BridgeConfig>>,
): Promise<boolean> {
  if (
    passesStrongD1Gate(
      priorD1.d1BodyPct,
      priorD1.d1ClosePct,
      priorD1.d1Direction,
      priorDirectionBias,
    )
  ) {
    return false;
  }

  await logD1FallbackDetection(
    supabase,
    tomorrowUtc,
    'D1_FALLBACK_SKIPPED_WEAK_D1',
    amdTag,
    priorDirectionBias,
    {
      evaluated_net_pips: priorD1.d1NetPips,
      evaluated_direction: priorD1.d1Direction,
    },
  );
  return true;
}

async function skipD1FallbackActiveWindow(
  supabase: SupabaseClient,
  tomorrowUtc: string,
  amdTag: string,
  priorDirectionBias: string,
): Promise<boolean> {
  const validUntilStr = await getBridgeConfigValue(supabase, 'omega_direction_valid_until');
  const isAlreadyValid =
    validUntilStr != null && new Date(validUntilStr).getTime() > Date.now();
  if (!isAlreadyValid) return false;

  console.log(
    `[AsianDirection] D1_FALLBACK skipped — existing window valid until ${validUntilStr}`,
  );
  await logD1FallbackDetection(
    supabase,
    tomorrowUtc,
    'D1_FALLBACK_SKIPPED_WINDOW_ACTIVE',
    amdTag,
    priorDirectionBias,
  );
  return true;
}

async function writeD1FallbackWindow(
  supabase: SupabaseClient,
  tomorrowUtc: string,
  amdTag: string,
  priorDirectionBias: string,
  priorD1: Awaited<ReturnType<typeof readPriorD1BridgeConfig>>,
): Promise<void> {
  const sessionExpiry = nextAsianSessionExpiry();
  await setBridgeConfigValues(supabase, {
    omega_direction: priorDirectionBias,
    omega_direction_valid_until: sessionExpiry,
  });

  console.log(
    `[AsianDirection] D1_FALLBACK SET — direction=${priorDirectionBias} ` +
      `valid_until=${sessionExpiry} amd_tag=${amdTag} ` +
      `d1_body=${priorD1.d1BodyPct}% d1_close_pos=${priorD1.d1ClosePct}%`,
  );

  await logD1FallbackDetection(
    supabase,
    tomorrowUtc,
    'D1_FALLBACK',
    amdTag,
    priorDirectionBias,
    {
      direction_set: priorDirectionBias,
      valid_until: sessionExpiry,
      evaluated_direction: priorD1.d1Direction,
      evaluated_net_pips: priorD1.d1NetPips,
    },
  );
}

async function runD1FallbackWindow(
  supabase: SupabaseClient,
  amdTag: string,
  priorDirectionBias: string,
): Promise<void> {
  try {
    const tomorrowUtc = computeTomorrowUtc();
    if (await skipD1FallbackManualMode(supabase, tomorrowUtc, amdTag, priorDirectionBias)) return;
    if (await skipD1FallbackNonFailedTag(supabase, tomorrowUtc, amdTag, priorDirectionBias)) return;

    const priorD1 = await readPriorD1BridgeConfig(supabase);
    if (await skipD1FallbackWeakD1(supabase, tomorrowUtc, amdTag, priorDirectionBias, priorD1)) {
      return;
    }
    if (await skipD1FallbackActiveWindow(supabase, tomorrowUtc, amdTag, priorDirectionBias)) {
      return;
    }

    await writeD1FallbackWindow(
      supabase,
      tomorrowUtc,
      amdTag,
      priorDirectionBias,
      priorD1,
    );
  } catch (fallbackErr: unknown) {
    console.error('[AsianDirection] D1_FALLBACK block failed:', String(fallbackErr));
  }
}

async function readOmegaDirection(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('bridge_config')
      .select('config_value')
      .eq('config_key', 'omega_direction')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[AsianDirection] bridge_config read failed:', error.message);
      return null;
    }

    return data?.config_value != null ? String(data.config_value) : null;
  } catch (readErr: unknown) {
    console.error('[AsianDirection] bridge_config read error:', String(readErr));
    return null;
  }
}

async function writePriorD1ContextToBridgeConfig(
  supabase: SupabaseClient,
  todayUtc: string,
): Promise<void> {
  try {
    const priorD1 = await fetchPriorD1Context(supabase, todayUtc);

    if (priorD1 === null) {
      logInfo('[AsianDirection] No prior D1 context available', { todayUtc });
      return;
    }

    const momentumSignal = computeD1MomentumSignal(priorD1);

    await Promise.all([
      writeBridgeConfigKey(supabase, 'd1_prior_direction', priorD1.direction),
      writeBridgeConfigKey(supabase, 'd1_prior_net_pips', String(priorD1.netPips)),
      writeBridgeConfigKey(supabase, 'd1_prior_body_pct', String(priorD1.bodyPct)),
      writeBridgeConfigKey(
        supabase,
        'd1_prior_close_pos_pct',
        String(priorD1.closePositionPct),
      ),
      writeBridgeConfigKey(supabase, 'd1_momentum_signal', momentumSignal),
    ]);

    logInfo('[AsianDirection] D1 context written', {
      priorDate: priorD1.tradeDate,
      direction: priorD1.direction,
      netPips: priorD1.netPips,
      bodyPct: priorD1.bodyPct,
      momentumSignal,
    });
  } catch (d1Err: unknown) {
    console.error('[AsianDirection] D1 context write failed:', String(d1Err));
  }
}

export async function runAsianDirectionSet(): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const todayUtc = utcTodayDate();
    const { lookupDate, isWeekendFallback } = resolveAmdLookupDate(todayUtc);
    const amdLookup = await fetchAmdTagForDate(supabase, lookupDate);

    if (amdLookup.error || amdLookup.amdTag == null) {
      await logAsianDirectionRow(supabase, {
        ...emptyLogFields(todayUtc, 'DIRECTION_SET'),
        action: 'SKIPPED_NO_AMD',
        reason: isWeekendFallback
          ? `Weekend fallback: no amd_state row found for Friday ${lookupDate} (today=${todayUtc})`
          : `No amd_state row found for ${lookupDate}`,
      });
      return;
    }

    const amdTag = amdLookup.amdTag;
    const isShifted = amdTag === 'AMD_SHIFTED';
    const priorDirectionBias = PRIOR_BIAS_MAP[amdTag] ?? 'neutral';

    await writePriorD1ContextToBridgeConfig(supabase, todayUtc);

    const shiftedOk = await writeBridgeConfigKey(
      supabase,
      'asian_prior_amd_shifted',
      isShifted ? 'true' : 'false',
    );
    const tagOk = await writeBridgeConfigKey(supabase, 'asian_prior_amd_tag', amdTag);

    const biasOk = await writeBridgeConfigKey(
      supabase,
      'asian_prior_direction_bias',
      priorDirectionBias,
    );

    const flagAction: AsianDirectionAction = isShifted
      ? 'AMD_SHIFTED_FLAG_SET'
      : 'AMD_NOT_SHIFTED_FLAG_SET';
    const writeSuffix = shiftedOk && tagOk && biasOk ? '' : ' (bridge_config update failed)';

    await logAsianDirectionRow(supabase, {
      ...emptyLogFields(todayUtc, 'DIRECTION_SET'),
      amd_tag: amdTag,
      action: flagAction,
      reason: `Prior day amd_tag=${amdTag} lookupDate=${lookupDate}${writeSuffix}`,
    });

    await runD1FallbackWindow(supabase, amdTag, priorDirectionBias);

    logInfo('[AsianDirection] Prior direction bias written', {
      amdTag,
      priorDirectionBias,
    });

    console.log(
      `[AsianDirection] AMD flag set for ${todayUtc}: shifted=${isShifted}, tag=${amdTag}, bias=${priorDirectionBias}`,
    );
  } catch (runErr: unknown) {
    console.error('[AsianDirection] runAsianDirectionSet failed:', String(runErr));
  }
}

export async function runAsianSessionClose(): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const todayUtc = utcTodayDate();
    const currentDirection = (await readOmegaDirection(supabase)) ?? 'long';

    try {
      await closeAllOpenOmegaPositions(supabase, currentDirection);
      console.log(
        '[AsianDirection] Asian session close complete. Direction was:',
        currentDirection,
      );
      void sendAsianCloseAlert({
        directionWas: currentDirection,
        tradeDate: todayUtc,
      }).catch(() => {});
    } catch (closeErr: unknown) {
      console.error('[AsianDirection] Error during Asian session close:', closeErr);
    }

    await logAsianDirectionRow(supabase, {
      ...emptyLogFields(todayUtc, 'ASIAN_CLOSE'),
      action: 'ASIAN_CLOSE',
      reason: `Asian session end 08:00 UTC — closed open Omega positions (direction: ${currentDirection})`,
      previous_direction: currentDirection,
    });
  } catch (runErr: unknown) {
    console.error('[AsianDirection] runAsianSessionClose failed:', String(runErr));
  }
}
