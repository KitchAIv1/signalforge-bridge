/** Load open SPEEDFLOOR papers, M5 candles (chunked), and omega fires. */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCandleRange } from '../../../connectors/oanda.js';
import {
  ALPHAOMEGA_BLOCK_SPEED_FLOOR,
  OMEGA_AO_BROKER_IDS,
} from '../alphaOmegaConstants.js';
import type { AlphaOmegaDirection } from '../alphaOmegaStreakTracker.js';
import { isOpenSpeedfloorPaperRow } from './speedfloorPaperIdentity.js';
import {
  SPEEDFLOOR_PAPER_MAX_HOLD_HOURS,
  type SpeedfloorPaperCandle,
  type SpeedfloorPaperFire,
} from './speedfloorPaperWalk.js';

const CHUNK_MS = 15 * 24 * 60 * 60 * 1000;

interface SpeedfloorTradeLogRow {
  id: string;
  signal_id: string | null;
  broker_id: string | null;
  direction: string | null;
  decision: string | null;
  block_reason: string | null;
  lane_advisory: string | null;
  status: string | null;
  entry_price: number | null;
  stop_loss: number | null;
  account_equity_at_signal: number | null;
  signal_received_at: string | null;
  created_at: string;
  pnl_pips: number | null;
  fill_price?: number | null;
}

export interface OpenSpeedfloorPaper {
  id: string;
  signalId: string;
  brokerId: string;
  direction: AlphaOmegaDirection;
  entryAt: string;
  entryPrice: number;
  stopLoss: number | null;
  equity: number | null;
}

function toDir(raw: string | null | undefined): AlphaOmegaDirection | null {
  const u = (raw ?? '').toUpperCase();
  if (u === 'LONG' || u === 'BUY') return 'LONG';
  if (u === 'SHORT' || u === 'SELL') return 'SHORT';
  return null;
}

export async function loadOpenSpeedfloorPapers(
  supabase: SupabaseClient,
  options?: { limit?: number },
): Promise<OpenSpeedfloorPaper[]> {
  const limit = Math.min(Math.max(options?.limit ?? 200, 1), 1000);
  // Filter SPEEDFLOOR at SQL — 1000+ other BLOCKED pending would drown a client filter.
  const { data, error } = await supabase
    .from('bridge_trade_log')
    .select(
      'id,signal_id,broker_id,direction,decision,block_reason,lane_advisory,status,' +
        'entry_price,stop_loss,account_equity_at_signal,signal_received_at,created_at,pnl_pips',
    )
    .eq('engine_id', 'omega')
    .eq('decision', 'BLOCKED')
    .eq('block_reason', ALPHAOMEGA_BLOCK_SPEED_FLOOR)
    .in('broker_id', [...OMEGA_AO_BROKER_IDS])
    .is('pnl_pips', null)
    .neq('status', 'closed')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error || !data) return [];

  const rows = data as unknown as SpeedfloorTradeLogRow[];
  const out: OpenSpeedfloorPaper[] = [];
  for (const row of rows) {
    if (!isOpenSpeedfloorPaperRow(row)) continue;
    const direction = toDir(row.direction);
    const entryPrice = Number(row.entry_price);
    if (!direction || !(entryPrice > 0)) continue;
    out.push({
      id: String(row.id),
      signalId: String(row.signal_id ?? ''),
      brokerId: String(row.broker_id),
      direction,
      entryAt: String(row.signal_received_at ?? row.created_at),
      entryPrice,
      stopLoss: row.stop_loss != null ? Number(row.stop_loss) : null,
      equity:
        row.account_equity_at_signal != null
          ? Number(row.account_equity_at_signal)
          : null,
    });
  }
  return out;
}

export async function loadSpeedfloorM5Chunked(
  fromMs: number,
  toMs: number,
): Promise<SpeedfloorPaperCandle[]> {
  const byTime = new Map<string, SpeedfloorPaperCandle>();
  for (let start = fromMs; start < toMs; start += CHUNK_MS) {
    const end = Math.min(start + CHUNK_MS, toMs);
    const bars = await fetchCandleRange(
      'AUD_USD',
      new Date(start).toISOString(),
      new Date(end).toISOString(),
      'M5',
    );
    for (const bar of bars) {
      if (!bar.complete) continue;
      const time = new Date(Date.parse(bar.time)).toISOString();
      byTime.set(time, {
        time,
        h: Number(bar.mid.h),
        l: Number(bar.mid.l),
        c: Number(bar.mid.c),
      });
    }
  }
  return [...byTime.values()].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

export async function loadOmegaFiresForPaper(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string,
): Promise<SpeedfloorPaperFire[]> {
  const bySignal = new Map<string, SpeedfloorPaperFire>();
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
    if (error || !data?.length) break;
    const rows = data as unknown as SpeedfloorTradeLogRow[];
    for (const row of rows) {
      const signalId = row.signal_id != null ? String(row.signal_id) : '';
      const direction = toDir(row.direction);
      if (!signalId || !direction || bySignal.has(signalId)) continue;
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

export function paperWindowBounds(papers: readonly OpenSpeedfloorPaper[]): {
  fromMs: number;
  toMs: number;
} {
  let minMs = Infinity;
  for (const paper of papers) {
    minMs = Math.min(minMs, Date.parse(paper.entryAt));
  }
  // Cap at now — OANDA rejects future `to`.
  return {
    fromMs: minMs - 5 * 60_000,
    toMs: Date.now(),
  };
}
