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
import { writeBridgeConfigKey } from './asianDetection/bridgeConfigHelpers.js';
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
  AMD_TEXTBOOK: 'neutral',
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
    const shiftedOk = await writeBridgeConfigKey(
      supabase,
      'asian_prior_amd_shifted',
      isShifted ? 'true' : 'false',
    );
    const tagOk = await writeBridgeConfigKey(supabase, 'asian_prior_amd_tag', amdTag);

    const priorDirectionBias = PRIOR_BIAS_MAP[amdTag] ?? 'neutral';
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
