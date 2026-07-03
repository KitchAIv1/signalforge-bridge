/** Load live OANDA fills keyed by signal fire time + direction. */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LiveFillRecord } from '../../src/services/omegaReplay/types.js';
import type { TradeDirection } from '../../src/services/omegaReplay/types.js';
import { storeLiveFill } from './fillLookup.js';

const PAGE_SIZE = 500;

function normalizeDirection(raw: unknown): TradeDirection | null {
  const direction = String(raw ?? '').toLowerCase();
  if (direction === 'long' || direction === 'short') return direction;
  return null;
}

function readNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickFiredAtIso(row: Record<string, unknown>): string | null {
  const received = row.signal_received_at;
  if (typeof received === 'string' && received.length > 0) return received;
  const created = row.created_at;
  if (typeof created === 'string' && created.length > 0) return created;
  return null;
}

export async function loadLiveFillBySignal(
  supabase: SupabaseClient,
  sinceIso: string,
): Promise<Map<string, LiveFillRecord>> {
  const fillMap = new Map<string, LiveFillRecord>();

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('bridge_trade_log')
      .select(
        'signal_id, signal_received_at, created_at, direction, fill_price, stop_loss, pnl_pips, close_reason, duration_minutes',
      )
      .eq('engine_id', 'omega')
      .eq('decision', 'EXECUTED')
      .eq('broker_id', 'oanda_practice')
      .eq('status', 'closed')
      .gte('created_at', sinceIso)
      .not('fill_price', 'is', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`loadLiveFillBySignal: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const raw of data) {
      const row = raw as Record<string, unknown>;
      const direction = normalizeDirection(row.direction);
      const fillPrice = readNum(row.fill_price);
      const structureStop = readNum(row.stop_loss);
      const firedAtIso = pickFiredAtIso(row);
      if (!direction || fillPrice == null || structureStop == null || !firedAtIso) continue;

      const record: LiveFillRecord = {
        fillPrice,
        structureStop,
        livePnlPips: readNum(row.pnl_pips),
        liveCloseReason: row.close_reason != null ? String(row.close_reason) : null,
        liveDurationMin: readNum(row.duration_minutes),
      };

      storeLiveFill(fillMap, String(row.signal_id ?? ''), firedAtIso, direction, record);
    }

    if (data.length < PAGE_SIZE) break;
  }

  return fillMap;
}

export { lookupLiveFill } from './fillLookup.js';
