/**
 * OANDA-only Fade coexistence guard.
 * Blocks PDL Window entry on OANDA when Fade has any open AUD_USD trade
 * on an OANDA broker. Never applied to MT5 routes.
 */

import { getSupabaseClient } from '../../connectors/supabase.js';
import { PDL_WINDOW_PAIR } from './pdlWindowConstants.js';

const FADE_TABLE = 'audusd_fade_trades';
const OANDA_BROKER_PREFIXES = ['oanda_'];

export function isOandaBrokerId(brokerId: string): boolean {
  return (
    brokerId === 'oanda_practice' ||
    OANDA_BROKER_PREFIXES.some((prefix) => brokerId.startsWith(prefix))
  );
}

export async function hasOpenFadeTradeOnOanda(
  pair = PDL_WINDOW_PAIR,
): Promise<boolean> {
  const { data, error } = await getSupabaseClient()
    .from(FADE_TABLE)
    .select('id, broker_id')
    .eq('pair', pair)
    .is('result', null);

  if (error) {
    console.error('[PdlWindow] Fade open check failed:', error.message);
    // Fail closed on OANDA — do not risk netting into an unknown Fade position.
    return true;
  }

  for (const row of data ?? []) {
    const brokerId = String(row.broker_id ?? 'oanda_practice');
    if (isOandaBrokerId(brokerId)) return true;
  }
  return false;
}
