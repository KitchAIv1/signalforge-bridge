/**
 * Shadow AO paper position tracking — opposing/share/backstop closes only.
 * Never calls broker close APIs.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logInfo, logWarn } from '../../utils/logger.js';
import {
  ALPHAOMEGA_CLOSE_BACKSTOP_CRACK,
  ALPHAOMEGA_CLOSE_OPPOSING_COUNT,
  ALPHAOMEGA_CLOSE_OPPOSING_SHARE,
  OMEGA_AO_SHADOW_BROKER_ID,
  OPPOSING_FIRE_COUNT_THRESHOLD,
  OPPOSING_SHARE_MIN_FIRES,
  OPPOSING_SHARE_THRESHOLD,
} from './alphaOmegaConstants.js';
import type { AlphaOmegaDirection, CrackEvent, StreakFireInput } from './alphaOmegaStreakTracker.js';
import { closeShadowPaperTrade } from './alphaOmegaShadowPaperClose.js';

const POSITION_TABLE = 'alpha_omega_shadow_position_state';

export interface ShadowPositionRow {
  paper_trade_id: string;
  broker_id: string;
  direction: AlphaOmegaDirection;
  entry_fired_at: string;
  entry_price: number | null;
  opposing_fire_count: number;
  total_fire_count: number;
  peak_favorable_pips: number;
}

export async function loadOpenShadowPositions(
  supabase: SupabaseClient,
): Promise<ShadowPositionRow[]> {
  const { data, error } = await supabase
    .from(POSITION_TABLE)
    .select(
      'paper_trade_id, broker_id, direction, entry_fired_at, entry_price, opposing_fire_count, total_fire_count, peak_favorable_pips',
    )
    .eq('broker_id', OMEGA_AO_SHADOW_BROKER_ID);
  if (error) {
    logWarn('[AlphaOmegaShadow] loadOpenShadowPositions failed', { error: error.message });
    return [];
  }
  return (data ?? []) as ShadowPositionRow[];
}

export async function registerShadowPaperPosition(
  supabase: SupabaseClient,
  params: {
    paperTradeId: string;
    direction: AlphaOmegaDirection;
    entryFiredAt: string;
    entryPrice: number | null;
  },
): Promise<void> {
  const { error } = await supabase.from(POSITION_TABLE).insert({
    paper_trade_id: params.paperTradeId,
    broker_id: OMEGA_AO_SHADOW_BROKER_ID,
    direction: params.direction,
    entry_fired_at: params.entryFiredAt,
    entry_price: params.entryPrice,
    opposing_fire_count: 0,
    total_fire_count: 0,
    peak_favorable_pips: 0,
  });
  if (error) {
    logWarn('[AlphaOmegaShadow] registerShadowPaperPosition failed', {
      error: error.message,
      paperTradeId: params.paperTradeId,
    });
  }
}

export async function hasOpenShadowPosition(supabase: SupabaseClient): Promise<boolean> {
  const rows = await loadOpenShadowPositions(supabase);
  return rows.length > 0;
}

export async function trackShadowFireAgainstOpenPositions(
  supabase: SupabaseClient,
  fire: StreakFireInput,
  crackEvent: CrackEvent | null,
  markPrice: number | null = null,
): Promise<void> {
  const positions = await loadOpenShadowPositions(supabase);
  for (const position of positions) {
    await applyShadowFireToPosition(supabase, position, fire, crackEvent, markPrice);
  }
}

async function applyShadowFireToPosition(
  supabase: SupabaseClient,
  position: ShadowPositionRow,
  fire: StreakFireInput,
  crackEvent: CrackEvent | null,
  markPrice: number | null,
): Promise<void> {
  const opposing = fire.direction !== position.direction;
  const nextOpposing = position.opposing_fire_count + (opposing ? 1 : 0);
  const nextTotal = position.total_fire_count + 1;
  await supabase
    .from(POSITION_TABLE)
    .update({
      opposing_fire_count: nextOpposing,
      total_fire_count: nextTotal,
      updated_at: new Date().toISOString(),
    })
    .eq('paper_trade_id', position.paper_trade_id);

  const exitPx = markPrice ?? position.entry_price;
  if (crackEvent && crackEvent.brokenDirection === position.direction) {
    await closeShadowPaperTrade(supabase, position, ALPHAOMEGA_CLOSE_BACKSTOP_CRACK, exitPx);
    return;
  }
  if (nextOpposing >= OPPOSING_FIRE_COUNT_THRESHOLD) {
    await closeShadowPaperTrade(supabase, position, ALPHAOMEGA_CLOSE_OPPOSING_COUNT, exitPx);
    return;
  }
  if (
    nextTotal >= OPPOSING_SHARE_MIN_FIRES &&
    nextOpposing / nextTotal >= OPPOSING_SHARE_THRESHOLD
  ) {
    await closeShadowPaperTrade(supabase, position, ALPHAOMEGA_CLOSE_OPPOSING_SHARE, exitPx);
  }
}

export async function deleteShadowPosition(
  supabase: SupabaseClient,
  paperTradeId: string,
): Promise<void> {
  const { error } = await supabase
    .from(POSITION_TABLE)
    .delete()
    .eq('paper_trade_id', paperTradeId);
  if (error) {
    logWarn('[AlphaOmegaShadow] deleteShadowPosition failed', {
      error: error.message,
      paperTradeId,
    });
  } else {
    logInfo('[AlphaOmegaShadow] position cleared', { paperTradeId });
  }
}
