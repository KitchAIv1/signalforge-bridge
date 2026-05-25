import type { SupabaseClient } from '@supabase/supabase-js';
import { sendAutoDirectionAlert } from '../telegram/alertAutoDirection.js';
import type {
  AmdAutoDirectionSnapshot,
  AmdTag,
  AutoDirection,
  AutoDirectionConfidence,
  DailyBiasAlignment,
  JudasDirection,
  Layer4D1Bias,
} from './amdTypes.js';

export function computeAutoDirectionSnapshot(
  amdTag: AmdTag,
  judasDirection: JudasDirection | null,
  layer4D1Bias: Layer4D1Bias,
  layer4BullishCount: number | null,
  layer4BearishCount: number | null,
  dailyBiasAlignment: DailyBiasAlignment,
  reversalConfirmed: boolean | null,
  judasPips: number | null,
): AmdAutoDirectionSnapshot {
  const bullish = layer4BullishCount ?? 0;
  const bearish = layer4BearishCount ?? 0;
  const strongConviction = bullish >= 4 || bearish >= 4;

  // D1 tier based on dominant vote count
  // TRENDING_STRONG: dominant side >= 4 (high conviction)
  // TRENDING_WEAK: dominant side === 3 (bare majority — one candle from ranging)
  // Other: not used in this branch (neutral or unknown)
  const dominantCount = Math.max(bullish, bearish);
  const d1Tier: 'TRENDING_STRONG' | 'TRENDING_WEAK' | 'OTHER' =
    dominantCount >= 4 ? 'TRENDING_STRONG' :
    dominantCount === 3 ? 'TRENDING_WEAK' :
    'OTHER';

  // Judas inversion for AMD_NONE: UP Judas = fake long = real SHORT, DOWN Judas = fake short = real LONG
  const judasFallbackDirection: AutoDirection | null =
    judasDirection === 'UP' ? 'short' :
    judasDirection === 'DOWN' ? 'long' :
    null; // FLAT or null = no fallback available

  let auto_direction: AutoDirection = 'neutral';
  let auto_direction_confidence: AutoDirectionConfidence = 'low';
  let auto_direction_reason = '';
  let amd_size_multiplier = 1.0;

  if (amdTag === 'AMD_TEXTBOOK') {
    if (judasDirection === 'UP') auto_direction = 'short';
    else if (judasDirection === 'DOWN') auto_direction = 'long';
    else auto_direction = 'neutral';

    if (auto_direction !== 'neutral') {
      if (dailyBiasAlignment === 'ALIGNED' && strongConviction) {
        auto_direction_confidence = 'high';
        amd_size_multiplier = 2.5;
        auto_direction_reason = `AMD_TEXTBOOK ALIGNED strong D1 (${bullish}up/${bearish}dn)`;
      } else if (dailyBiasAlignment === 'ALIGNED') {
        auto_direction_confidence = 'medium';
        amd_size_multiplier = 1.5;
        auto_direction_reason = `AMD_TEXTBOOK ALIGNED weak D1 (${bullish}up/${bearish}dn)`;
      } else {
        auto_direction_confidence = 'low';
        amd_size_multiplier = 0.5;
        auto_direction_reason = `AMD_TEXTBOOK CONFLICTED D1 (${bullish}up/${bearish}dn) coin-flip`;
      }
    }

  } else if (amdTag === 'AMD_COMPRESSION_BREAKOUT') {
    if (judasDirection === 'UP') auto_direction = 'long';
    else if (judasDirection === 'DOWN') auto_direction = 'short';
    else auto_direction = 'neutral';

    if (auto_direction !== 'neutral') {
      auto_direction_confidence = 'medium';
      amd_size_multiplier = 1.5;
      auto_direction_reason =
        `AMD_COMPRESSION_BREAKOUT continuation judas=${judasDirection ?? 'null'}`;
    }

  } else if (amdTag === 'AMD_FAILED') {
    if (layer4D1Bias === 'TRENDING_UP') auto_direction = 'long';
    else if (layer4D1Bias === 'TRENDING_DOWN') auto_direction = 'short';
    else auto_direction = 'neutral';

    if (auto_direction === 'neutral') {
      auto_direction_reason =
        'AMD_FAILED RANGING D1 — no directional signal';
    }

    if (auto_direction !== 'neutral') {
      if (dailyBiasAlignment === 'ALIGNED' && strongConviction) {
        auto_direction_confidence = 'medium';
        amd_size_multiplier = 1.75;
        auto_direction_reason =
          `AMD_FAILED ALIGNED strong D1 (${bullish}up/${bearish}dn)`;
      } else if (dailyBiasAlignment === 'ALIGNED') {
        auto_direction_confidence = 'low';
        amd_size_multiplier = 1.0;
        auto_direction_reason =
          `AMD_FAILED ALIGNED weak D1 (${bullish}up/${bearish}dn)`;
      } else {
        auto_direction_confidence = 'low';
        amd_size_multiplier = 0.25;
        auto_direction_reason =
          `AMD_FAILED CONFLICTED D1 (${bullish}up/${bearish}dn) below-random`;
      }
    }

  } else if (amdTag === 'AMD_SHIFTED') {
    // D1 bias governs on SHIFTED days — validated 71% accuracy (272-day backtest)
    // Judas inversion tested and reverted: 56% accuracy — worse than D1 on all slices
    // judasPips retained in signature for future logging/analysis only
    if (layer4D1Bias === 'TRENDING_UP') auto_direction = 'long';
    else if (layer4D1Bias === 'TRENDING_DOWN') auto_direction = 'short';
    else auto_direction = 'neutral';

    if (auto_direction !== 'neutral') {
      if (strongConviction) {
        auto_direction_confidence = 'medium';
        amd_size_multiplier = dailyBiasAlignment === 'ALIGNED' ? 1.5 : 0.75;
        auto_direction_reason =
          `AMD_SHIFTED ${dailyBiasAlignment ?? 'null'} strong D1 (${bullish}up/${bearish}dn)`;
      } else {
        auto_direction_confidence = 'low';
        amd_size_multiplier = dailyBiasAlignment === 'ALIGNED' ? 1.0 : 0.5;
        auto_direction_reason =
          `AMD_SHIFTED ${dailyBiasAlignment ?? 'null'} weak D1 (${bullish}up/${bearish}dn)`;
      }
    }

  } else if (amdTag === 'AMD_NONE') {

    if (d1Tier === 'TRENDING_WEAK' && judasFallbackDirection !== null) {
      // TRENDING_WEAK (dominant count = 3): Judas inversion outperforms D1
      // Backtest: Judas 60% vs D1 56% on n=25 (272-day dataset, May 2025–May 2026)
      auto_direction = judasFallbackDirection;
      auto_direction_confidence = 'low';
      amd_size_multiplier = dailyBiasAlignment === 'ALIGNED' ? 0.75 : 0.5;
      auto_direction_reason =
        `AMD_NONE TRENDING_WEAK judas_fallback=${judasFallbackDirection} ` +
        `(${bullish}up/${bearish}dn) d1_would_have=${layer4D1Bias === 'TRENDING_UP' ? 'long' : 'short'} ` +
        `align=${dailyBiasAlignment ?? 'null'}`;

    } else if (d1Tier === 'TRENDING_WEAK' && judasFallbackDirection === null) {
      // TRENDING_WEAK but Judas is FLAT or null — cannot use fallback, fall to D1
      if (layer4D1Bias === 'TRENDING_UP') auto_direction = 'long';
      else if (layer4D1Bias === 'TRENDING_DOWN') auto_direction = 'short';
      else auto_direction = 'neutral';
      if (auto_direction !== 'neutral') {
        auto_direction_confidence = 'low';
        amd_size_multiplier = 0.5;
        auto_direction_reason =
          `AMD_NONE TRENDING_WEAK judas_flat_fallback_to_d1 ` +
          `(${bullish}up/${bearish}dn) align=${dailyBiasAlignment ?? 'null'}`;
      }

    } else if (d1Tier === 'TRENDING_STRONG') {
      // TRENDING_STRONG (dominant count >= 4): D1 wins (55.6% tied — forward testing Judas)
      // Direction stays on D1. Judas fallback tagged in reason string for forward test analysis.
      if (layer4D1Bias === 'TRENDING_UP') auto_direction = 'long';
      else if (layer4D1Bias === 'TRENDING_DOWN') auto_direction = 'short';
      else auto_direction = 'neutral';
      if (auto_direction !== 'neutral') {
        auto_direction_confidence = 'low';
        amd_size_multiplier = dailyBiasAlignment === 'ALIGNED' ? 1.0 : 0.25;
        auto_direction_reason =
          `AMD_NONE TRENDING_STRONG d1=${auto_direction} ` +
          `(${bullish}up/${bearish}dn) align=${dailyBiasAlignment ?? 'null'} ` +
          `judas_fwd_test=${judasFallbackDirection ?? 'none'}`;
      }

    } else {
      // RANGING D1 (dominant < 3) or UNKNOWN — neutral, use Judas if available for logging only
      if (layer4D1Bias === 'TRENDING_UP') auto_direction = 'long';
      else if (layer4D1Bias === 'TRENDING_DOWN') auto_direction = 'short';
      else auto_direction = 'neutral';
      if (auto_direction !== 'neutral') {
        auto_direction_confidence = 'very_low';
        amd_size_multiplier = 0.25;
        auto_direction_reason =
          `AMD_NONE OTHER_TIER d1=${auto_direction} ` +
          `(${bullish}up/${bearish}dn) judas=${judasDirection ?? 'null'}`;
      } else {
        auto_direction_reason =
          `AMD_NONE RANGING D1 — no directional signal ` +
          `judas_available=${judasFallbackDirection ?? 'none'}`;
      }
    }

  } else {
    auto_direction = 'neutral';
    auto_direction_confidence = 'low';
    amd_size_multiplier = 1.0;
    auto_direction_reason =
      `${amdTag} insufficient data for auto direction`;
  }

  // Reversal confirmation modifier
  // When reversal_confirmed is false: price did not validate the AMD intraday setup
  // Reduce multiplier by 0.5. If already low/very_low confidence → set neutral (do not override direction)
  // Reversal modifier only applies to TEXTBOOK and FAILED
  // These are the only tags where reversal confirmation is part of the prediction signal
  // TEXTBOOK: reversal failure invalidates the AMD structure
  // FAILED: AMD attempted reversal but failed — reversal=false confirms the failure
  // COMPRESSION_BREAKOUT: uses continuation — reversal=false is expected and normal (83% accuracy)
  // SHIFTED: uses D1 bias — reversal confirmation structurally irrelevant to D1 prediction
  // NONE: uses D1 bias — same reasoning as SHIFTED
  if (
    reversalConfirmed === false &&
    auto_direction !== 'neutral' &&
    (amdTag === 'AMD_TEXTBOOK' || amdTag === 'AMD_FAILED')
  ) {
    amd_size_multiplier = parseFloat((amd_size_multiplier * 0.5).toFixed(4));
    if (auto_direction_confidence === 'low' || auto_direction_confidence === 'very_low') {
      auto_direction = 'neutral';
      auto_direction_reason = `${auto_direction_reason} [reversal_unconfirmed→neutral]`;
    } else {
      auto_direction_reason = `${auto_direction_reason} [reversal_unconfirmed→0.5x]`;
    }
  }
  // reversalConfirmed === null means insufficient data — no adjustment
  // reversalConfirmed === true means reversal confirmed — no adjustment needed

  return {
    auto_direction,
    auto_direction_confidence,
    auto_direction_reason,
    amd_size_multiplier,
  };
}

/** Extra context forwarded from the detector call-site for the Telegram alert. */
export type AmdDirectionAlertContext = {
  confidence: string;
  multiplier: number;
  amdTag: string;
};

/**
 * Returns ISO string for 14:00:00 UTC today.
 * AMD distribution window closes at 14:00 UTC.
 * If already past 14:00 UTC, returns 14:00 UTC tomorrow (late-run edge case).
 */
function computeAmdWindowExpiry(): string {
  const now = new Date();
  const candidate = new Date(now);
  candidate.setUTCHours(14, 0, 0, 0);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate.toISOString();
}

async function writeAmdWindowExpiry(
  supabaseDb: SupabaseClient,
  expiryIso: string,
): Promise<void> {
  const { error } = await supabaseDb
    .from('bridge_config')
    .update({
      config_value: expiryIso,
      updated_at: new Date().toISOString(),
    })
    .eq('config_key', 'omega_direction_valid_until');
  if (error) {
    console.warn('[AmdDetector] Failed to write omega_direction_valid_until:', error.message);
  }
}

export async function applyAutoDirectionToBridgeConfig(
  supabaseDb: SupabaseClient,
  autoDirection: AutoDirection,
  reason: string,
  alertContext?: AmdDirectionAlertContext,
): Promise<void> {
  const { data: modeRow, error: modeErr } = await supabaseDb
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', 'direction_mode')
    .maybeSingle();

  if (modeErr) {
    console.warn('[AmdDetector] Could not read direction_mode:', modeErr.message);
    return;
  }

  const directionMode =
    typeof modeRow?.config_value === 'string' ? modeRow.config_value : 'manual';

  if (directionMode !== 'auto') {
    console.log(
      `[AmdDetector] direction_mode=${directionMode} — skipping auto omega_direction write`,
    );
    return;
  }

  if (autoDirection === 'neutral') {
    console.log(
      `[AmdDetector] auto_direction=neutral — expiring omega window. Reason: ${reason}`,
    );
    await writeAmdWindowExpiry(supabaseDb, new Date().toISOString());
    return;
  }

  const { error: writeErr } = await supabaseDb
    .from('bridge_config')
    .update({
      config_value: autoDirection,
      updated_at: new Date().toISOString(),
    })
    .eq('config_key', 'omega_direction');

  if (writeErr) {
    console.warn('[AmdDetector] Failed to write auto omega_direction:', writeErr.message);
    return;
  }

  const expiryIso = computeAmdWindowExpiry();
  await writeAmdWindowExpiry(supabaseDb, expiryIso);

  console.log(
    `[AmdDetector] AUTO direction → ${autoDirection.toUpperCase()} | valid until ${expiryIso} | ${reason}`,
  );

  if (alertContext) {
    void sendAutoDirectionAlert({
      autoDirection,
      reason,
      confidence: alertContext.confidence,
      amdSizeMultiplier: alertContext.multiplier,
      amdTag: alertContext.amdTag,
    }).catch(() => {});
  }
}
