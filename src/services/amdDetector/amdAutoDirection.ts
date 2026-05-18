import type { SupabaseClient } from '@supabase/supabase-js';
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
): AmdAutoDirectionSnapshot {
  const bullish = layer4BullishCount ?? 0;
  const bearish = layer4BearishCount ?? 0;
  const strongConviction = bullish >= 4 || bearish >= 4;

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
    if (layer4D1Bias === 'TRENDING_UP') auto_direction = 'long';
    else if (layer4D1Bias === 'TRENDING_DOWN') auto_direction = 'short';
    else auto_direction = 'neutral';

    if (auto_direction !== 'neutral') {
      if (dailyBiasAlignment === 'ALIGNED') {
        auto_direction_confidence = 'low';
        amd_size_multiplier = 1.0;
        auto_direction_reason =
          `AMD_NONE ALIGNED D1 (${bullish}up/${bearish}dn)`;
      } else {
        auto_direction_confidence = 'very_low';
        amd_size_multiplier = 0.25;
        auto_direction_reason =
          `AMD_NONE CONFLICTED D1 (${bullish}up/${bearish}dn) below-random`;
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
  if (reversalConfirmed === false && auto_direction !== 'neutral') {
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

export async function applyAutoDirectionToBridgeConfig(
  supabaseDb: SupabaseClient,
  autoDirection: AutoDirection,
  reason: string,
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
      `[AmdDetector] auto_direction=neutral — skipping omega_direction write. Reason: ${reason}`,
    );
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

  console.log(`[AmdDetector] AUTO direction → ${autoDirection.toUpperCase()} | ${reason}`);
}
