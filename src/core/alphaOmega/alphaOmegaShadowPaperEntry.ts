/**
 * Shadow AO paper entry on qualifying crack — never places broker orders.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalInsertPayload } from '../../connectors/supabase.js';
import { logInfo, logWarn } from '../../utils/logger.js';
import {
  ALPHAOMEGA_SHADOW_ENTRY_ADVISORY_PREFIX,
  OMEGA_AO_SHADOW_BROKER_ID,
  roundAdvisorySpeedMin,
} from './alphaOmegaConstants.js';
import { evaluateAlphaOmegaEntryGate } from './alphaOmegaEntryGate.js';
import type { CrackEvent } from './alphaOmegaStreakTracker.js';
import {
  hasOpenShadowPosition,
  registerShadowPaperPosition,
} from './alphaOmegaShadowPositionTracking.js';
import {
  readOmegaFireDirection,
  readOmegaFireTimestamp,
  readOmegaSignalId,
} from './alphaOmegaFireIdentity.js';

function midEntryPrice(payload: SignalInsertPayload): number | null {
  const low = payload.entry_zone_low != null ? Number(payload.entry_zone_low) : null;
  const high = payload.entry_zone_high != null ? Number(payload.entry_zone_high) : null;
  if (low != null && high != null && Number.isFinite(low) && Number.isFinite(high)) {
    return (low + high) / 2;
  }
  if (low != null && Number.isFinite(low)) return low;
  return null;
}

export async function maybeEnterShadowPaperOnCrack(
  supabase: SupabaseClient,
  payload: SignalInsertPayload,
  crackEvent: CrackEvent | null,
  source: 'matched' | 'over_threshold',
): Promise<boolean> {
  const direction = readOmegaFireDirection(payload);
  if (!direction || !crackEvent) return false;

  const alreadyOpen = await hasOpenShadowPosition(supabase);
  const gate = evaluateAlphaOmegaEntryGate({
    crackEvent,
    direction,
    hasOpenPosition: alreadyOpen,
    asOf: new Date(readOmegaFireTimestamp(payload)),
  });
  if (!gate.enter) return false;

  const signalId = readOmegaSignalId(payload) ?? `shadow-${Date.now()}`;
  const paperTradeId = `shadow-${signalId}`;
  const entryPrice = midEntryPrice(payload);
  const firedAt = readOmegaFireTimestamp(payload);
  const speed = roundAdvisorySpeedMin(crackEvent.foundingSpeedMin);
  const advisory =
    `${ALPHAOMEGA_SHADOW_ENTRY_ADVISORY_PREFIX}:crack_len=${crackEvent.foundingLength}` +
    `_speed=${speed.toFixed(1)}m_src=${source}`;

  const { error } = await supabase.from('bridge_trade_log').insert({
    signal_id: payload.id ?? null,
    engine_id: 'omega',
    pair: payload.pair ?? 'AUDUSD',
    direction,
    confluence_score: payload.confluence_score ?? null,
    entry_zone_low: payload.entry_zone_low ?? null,
    entry_zone_high: payload.entry_zone_high ?? null,
    entry_price: entryPrice,
    fill_price: entryPrice,
    stop_loss: payload.stop_loss ?? null,
    signal_received_at: firedAt,
    decision: 'EXECUTED',
    block_reason: null,
    broker_id: OMEGA_AO_SHADOW_BROKER_ID,
    oanda_trade_id: paperTradeId,
    status: 'open',
    lane_advisory: advisory,
    open_positions_count: 0,
  });

  if (error) {
    logWarn('[AlphaOmegaShadow] paper entry trade_log insert failed', {
      error: error.message,
      paperTradeId,
    });
    return false;
  }

  await registerShadowPaperPosition(supabase, {
    paperTradeId,
    direction,
    entryFiredAt: firedAt,
    entryPrice,
  });

  logInfo('[AlphaOmegaShadow] paper entry opened', {
    paperTradeId,
    direction,
    advisory,
  });
  return true;
}
