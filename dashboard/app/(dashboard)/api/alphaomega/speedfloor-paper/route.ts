/**
 * SPEEDFLOOR paper PnL API — prefers stored closes; sims only still-open rows.
 * NEVER writes bridge_trade_log / NEVER places broker orders.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isSpeedfloorShadowRow } from '@/lib/alphaOmegaPaper/isSpeedfloorShadowRow';
import { mapStoredSpeedfloorOutcome } from '@/lib/alphaOmegaPaper/mapStoredSpeedfloorOutcome';
import { mapTradeToPaperInput } from '@/lib/alphaOmegaPaper/mapTradeToPaperInput';
import { simulateSpeedfloorPaperBatch } from '@/lib/alphaOmegaPaper/simulateSpeedfloorPaperBatch';
import type {
  SpeedfloorPaperInput,
  SpeedfloorPaperOutcome,
} from '@/lib/alphaOmegaPaper/paperSimTypes';
import type { BridgeTradeLogRow } from '@/lib/types';

function createServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env for paper API');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { tradeIds?: string[] };
    const tradeIds = Array.isArray(body.tradeIds)
      ? body.tradeIds.filter((id) => typeof id === 'string').slice(0, 200)
      : [];
    if (tradeIds.length === 0) {
      return NextResponse.json({ outcomes: {}, givebackEnabled: false });
    }

    const supabase = createServiceSupabase();
    const outcomes: Record<string, SpeedfloorPaperOutcome> = {};
    const needSimInputs: SpeedfloorPaperInput[] = [];

    // Chunk .in() — PostgREST URL limits; never silently drop caller IDs.
    for (let i = 0; i < tradeIds.length; i += 40) {
      const chunk = tradeIds.slice(i, i + 40);
      const { data, error } = await supabase
        .from('bridge_trade_log')
        .select(
          'id,signal_id,direction,decision,block_reason,lane_advisory,status,' +
            'entry_price,stop_loss,account_equity_at_signal,signal_received_at,created_at,' +
            'broker_id,exit_price,pnl_pips,pnl_dollars,close_reason,closed_at,duration_minutes',
        )
        .in('id', chunk);
      if (error) throw new Error(error.message);

      for (const row of (data ?? []) as unknown as BridgeTradeLogRow[]) {
        if (!isSpeedfloorShadowRow(row)) continue;
        const stored = mapStoredSpeedfloorOutcome(row);
        if (stored) {
          outcomes[row.id] = stored;
          continue;
        }
        const input = mapTradeToPaperInput(row);
        if (input) needSimInputs.push(input);
      }
    }

    const batch =
      needSimInputs.length > 0
        ? await simulateSpeedfloorPaperBatch(supabase, needSimInputs)
        : { outcomes: {}, givebackEnabled: false };

    return NextResponse.json({
      outcomes: { ...outcomes, ...batch.outcomes },
      givebackEnabled: batch.givebackEnabled,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
