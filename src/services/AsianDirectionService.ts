/**
 * Asian Direction automation — sets omega_direction on AMD_SHIFTED days at 21:00 UTC,
 * closes Omega positions at 08:00 UTC Asian session end.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { closeAllOpenOmegaPositions } from './omegaClosePositions.js';
import { fetchPriorD1Candle } from './asianDirection/fetchPriorD1.js';
import { sendAsianOpenAlert, sendAsianCloseAlert } from './telegram/alertAsianSession.js';
import { logAsianDirectionRow } from './asianDirection/logAsianDirection.js';
import type {
  AsianDirectionAction,
  AsianDirectionLogRow,
  AsianDirectionTriggerType,
} from './asianDirection/types.js';

function buildAsianDirectionSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('[AsianDirection] Missing SUPABASE_URL or service key env var');
  }
  return createClient(supabaseUrl, supabaseKey);
}

function utcTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Resolves the correct date to use for amd_state lookups.
 * amd_state only has rows for trading days (Mon–Fri).
 * On Sunday at 21:00 UTC (Asian open), use Friday's date instead.
 * On Saturday (should not fire but defensive): use Friday's date.
 * All other days: use today's date.
 */
function resolveAmdLookupDate(todayUtc: string): { lookupDate: string; isWeekendFallback: boolean } {
  const d = new Date(`${todayUtc}T21:00:00.000Z`);
  const dayOfWeek = d.getUTCDay(); // 0=Sunday, 1=Monday ... 6=Saturday

  if (dayOfWeek === 0) {
    // Sunday — use Friday (subtract 2 days)
    const friday = new Date(d);
    friday.setUTCDate(friday.getUTCDate() - 2);
    return {
      lookupDate: friday.toISOString().slice(0, 10),
      isWeekendFallback: true,
    };
  }

  if (dayOfWeek === 6) {
    // Saturday — use Friday (subtract 1 day)
    // Defensive: cron should never fire on Saturday but handle it safely
    const friday = new Date(d);
    friday.setUTCDate(friday.getUTCDate() - 1);
    return {
      lookupDate: friday.toISOString().slice(0, 10),
      isWeekendFallback: true,
    };
  }

  // Monday–Friday: use today
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

async function fetchTodayAmdTag(
  supabase: SupabaseClient,
  todayUtc: string,
): Promise<{ amdTag: string | null; error: boolean }> {
  try {
    const { data, error } = await supabase
      .from('amd_state')
      .select('amd_tag')
      .eq('trade_date', todayUtc)
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

async function readOmegaDirection(
  supabase: SupabaseClient,
): Promise<string | null> {
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

/**
 * Returns ISO string for the next 08:00:00 UTC occurrence.
 * Asian session window: 21:00 UTC → next 08:00 UTC.
 */
function nextAsianSessionExpiry(): string {
  const now = new Date();
  const candidate = new Date(now);
  candidate.setUTCHours(8, 0, 0, 0);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate.toISOString();
}

/**
 * Writes omega_direction_valid_until to bridge_config.
 * Non-fatal — never throws.
 */
async function writeOmegaDirectionValidUntil(
  supabase: SupabaseClient,
  expiryIso: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('bridge_config')
      .update({
        config_value: expiryIso,
        updated_at: new Date().toISOString(),
      })
      .eq('config_key', 'omega_direction_valid_until');
    if (error) {
      console.error('[AsianDirection] Failed to write valid_until:', error.message);
    }
  } catch (err: unknown) {
    console.error('[AsianDirection] valid_until write error:', String(err));
  }
}

async function writeOmegaDirection(
  supabase: SupabaseClient,
  directionToSet: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('bridge_config')
      .update({
        config_value: directionToSet,
        updated_at: new Date().toISOString(),
      })
      .eq('config_key', 'omega_direction');

    if (error) {
      console.error('[AsianDirection] Failed to write omega_direction:', error.message);
      return false;
    }

    return true;
  } catch (writeErr: unknown) {
    console.error('[AsianDirection] omega_direction write error:', String(writeErr));
    return false;
  }
}

export async function runAsianDirectionSet(): Promise<void> {
  try {
    const supabase = buildAsianDirectionSupabaseClient();
    const todayUtc = utcTodayDate();

    // Weekend fallback: amd_state has no rows for Saturday/Sunday.
    // On Sunday 21:00 UTC (Asian open), use Friday's AMD tag instead.
    const { lookupDate, isWeekendFallback } = resolveAmdLookupDate(todayUtc);
    const amdLookup = await fetchTodayAmdTag(supabase, lookupDate);

    if (amdLookup.error || amdLookup.amdTag == null) {
      await writeOmegaDirectionValidUntil(supabase, new Date().toISOString());
      await logAsianDirectionRow(supabase, {
        ...emptyLogFields(todayUtc, 'DIRECTION_SET'),
        action: 'SKIPPED_NO_AMD',
        reason: isWeekendFallback
          ? `Weekend fallback: no amd_state row found for Friday ${lookupDate} (today=${todayUtc})`
          : `No amd_state row found for ${todayUtc}`,
      });
      return;
    }

    const amdTag = amdLookup.amdTag;
    if (amdTag !== 'AMD_SHIFTED') {
      await writeOmegaDirectionValidUntil(supabase, new Date().toISOString());
      await logAsianDirectionRow(supabase, {
        ...emptyLogFields(todayUtc, 'DIRECTION_SET'),
        action: 'SKIPPED_NOT_SHIFTED',
        reason: `AMD tag is ${amdTag} — only AMD_SHIFTED triggers auto-direction`,
        amd_tag: amdTag,
      });
      return;
    }

    const oandaToken = process.env.OANDA_API_TOKEN ?? '';
    const oandaEnv = process.env.OANDA_ENVIRONMENT ?? 'practice';
    const priorD1 = await fetchPriorD1Candle(todayUtc, oandaToken, oandaEnv);

    if (priorD1 == null) {
      await writeOmegaDirectionValidUntil(supabase, new Date().toISOString());
      await logAsianDirectionRow(supabase, {
        ...emptyLogFields(todayUtc, 'DIRECTION_SET'),
        action: 'SKIPPED_NO_D1',
        reason: `Could not fetch prior D1 candle for ${todayUtc}`,
        amd_tag: amdTag,
      });
      return;
    }

    const priorD1Direction = priorD1.close > priorD1.open ? 'BULLISH' : 'BEARISH';
    const priorD1BodyPips =
      Math.round(Math.abs(priorD1.close - priorD1.open) * 10000 * 100) / 100;
    const directionToSet = priorD1Direction === 'BULLISH' ? 'long' : 'short';
    const previousDirection = await readOmegaDirection(supabase);

    if (previousDirection === directionToSet) {
      // Direction unchanged but window is still valid — extend to next 08:00 UTC
      await writeOmegaDirectionValidUntil(supabase, nextAsianSessionExpiry());
      await logAsianDirectionRow(supabase, {
        ...emptyLogFields(todayUtc, 'DIRECTION_SET'),
        action: 'NO_CHANGE',
        reason: `omega_direction already set to ${directionToSet}`,
        amd_tag: amdTag,
        prior_d1_direction: priorD1Direction,
        prior_d1_body_pips: priorD1BodyPips,
        prior_d1_close: priorD1.close,
        direction_set: directionToSet,
        previous_direction: previousDirection,
        direction_changed: false,
      });
      return;
    }

    const writeOk = await writeOmegaDirection(supabase, directionToSet);
    const setAction: AsianDirectionAction =
      directionToSet === 'long' ? 'SET_LONG' : 'SET_SHORT';
    const reasonSuffix = writeOk ? '' : ' (bridge_config update failed)';

    await logAsianDirectionRow(supabase, {
      ...emptyLogFields(todayUtc, 'DIRECTION_SET'),
      amd_tag: amdTag,
      prior_d1_direction: priorD1Direction,
      prior_d1_body_pips: priorD1BodyPips,
      prior_d1_close: priorD1.close,
      direction_set: directionToSet,
      previous_direction: previousDirection,
      direction_changed: writeOk,
      action: setAction,
      reason:
        `AMD_SHIFTED + D1 ${priorD1Direction} → set omega_direction=${directionToSet}` +
        reasonSuffix,
    });

    if (writeOk) {
      await writeOmegaDirectionValidUntil(supabase, nextAsianSessionExpiry());
      console.log(
        `[AsianDirection] omega_direction set to ${directionToSet} for ${todayUtc}. ` +
          `AMD_SHIFTED + D1 ${priorD1Direction}. Previous: ${previousDirection}`,
      );
      void sendAsianOpenAlert({
        directionSet: directionToSet,
        previousDirection,
        amdTag,
        priorD1Direction,
        priorD1BodyPips,
        directionChanged: true,
      }).catch(() => {});
    }
  } catch (runErr: unknown) {
    console.error('[AsianDirection] runAsianDirectionSet failed:', String(runErr));
  }
}

export async function runAsianSessionClose(): Promise<void> {
  try {
    const supabase = buildAsianDirectionSupabaseClient();
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
