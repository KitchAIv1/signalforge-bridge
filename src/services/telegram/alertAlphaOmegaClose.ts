/**
 * Send ALPHAOMEGA Lane B close Telegram after a successful broker close.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTradeClosedAlert } from './alertTradeClose.js';
import {
  ALPHAOMEGA_LANE_LABEL,
  formatAlphaOmegaCloseReasonForTelegram,
} from './alphaOmegaTelegramLabels.js';
import type { AlphaOmegaDirection } from '../../core/alphaOmega/alphaOmegaStreakTracker.js';

export interface AlphaOmegaCloseAlertPosition {
  oanda_trade_id: string;
  direction: AlphaOmegaDirection;
  entry_fired_at: string;
  entry_price: number | null;
}

function durationMinutes(entryFiredAt: string, closedAt: string): number {
  const startMs = Date.parse(entryFiredAt);
  const endMs = Date.parse(closedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.round((endMs - startMs) / 60_000));
}

async function resolveInstrument(
  supabase: SupabaseClient,
  oandaTradeId: string,
): Promise<string> {
  const { data } = await supabase
    .from('bridge_trade_log')
    .select('pair')
    .eq('oanda_trade_id', oandaTradeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.pair ? String(data.pair) : 'AUD_USD';
}

export async function sendAlphaOmegaClosedAlert(params: {
  supabase: SupabaseClient;
  position: AlphaOmegaCloseAlertPosition;
  reason: string;
  closedAt: string;
  exitPrice: number | null;
  pnlDollars: number | null;
  pnlPips: number | null;
}): Promise<void> {
  const { position, reason, closedAt, exitPrice, pnlDollars, pnlPips } = params;
  if (exitPrice == null || position.entry_price == null) return;

  const instrument = await resolveInstrument(params.supabase, position.oanda_trade_id);
  await sendTradeClosedAlert({
    engineId: 'omega',
    instrument,
    direction: position.direction,
    entryPrice: Number(position.entry_price),
    exitPrice,
    pnlPips: pnlPips ?? 0,
    pnlDollars: pnlDollars ?? 0,
    closeReason: formatAlphaOmegaCloseReasonForTelegram(reason),
    durationMinutes: durationMinutes(position.entry_fired_at, closedAt),
    laneLabel: ALPHAOMEGA_LANE_LABEL,
  });
}
