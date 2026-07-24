/** Load deduped omega fires for paper opposing/backstop (read-only). */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaperFire } from './paperSimTypes';

function toDir(raw: string | null): 'LONG' | 'SHORT' | null {
  const upper = (raw ?? '').toUpperCase();
  if (upper === 'LONG' || upper === 'BUY') return 'LONG';
  if (upper === 'SHORT' || upper === 'SELL') return 'SHORT';
  return null;
}

export async function loadPaperFiresInRange(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string,
): Promise<PaperFire[]> {
  const bySignal = new Map<string, PaperFire>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('bridge_trade_log')
      .select(
        'signal_id,direction,signal_received_at,created_at,entry_price,fill_price',
      )
      .eq('engine_id', 'omega')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      const signalId = row.signal_id != null ? String(row.signal_id) : '';
      if (!signalId || bySignal.has(signalId)) continue;
      const direction = toDir(row.direction != null ? String(row.direction) : null);
      if (!direction) continue;
      const mark =
        row.fill_price != null
          ? Number(row.fill_price)
          : row.entry_price != null
            ? Number(row.entry_price)
            : null;
      bySignal.set(signalId, {
        signalId,
        direction,
        firedAt: String(row.signal_received_at ?? row.created_at),
        markPrice: mark != null && Number.isFinite(mark) ? mark : null,
      });
    }
    if (data.length < 1000) break;
  }
  return [...bySignal.values()].sort(
    (a, b) => Date.parse(a.firedAt) - Date.parse(b.firedAt),
  );
}

export function firesAfterEntry(
  fires: readonly PaperFire[],
  entryAt: string,
  entrySignalId: string,
): PaperFire[] {
  const entryMs = Date.parse(entryAt);
  return fires.filter(
    (fire) =>
      fire.signalId !== entrySignalId && Date.parse(fire.firedAt) > entryMs,
  );
}
