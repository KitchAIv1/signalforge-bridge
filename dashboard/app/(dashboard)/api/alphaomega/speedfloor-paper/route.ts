/**
 * Read-only SPEEDFLOOR paper PnL API.
 * NEVER writes bridge_trade_log / NEVER places or closes broker orders.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isSpeedfloorShadowRow } from '@/lib/alphaOmegaPaper/isSpeedfloorShadowRow';
import { mapTradeToPaperInput } from '@/lib/alphaOmegaPaper/mapTradeToPaperInput';
import { simulateSpeedfloorPaperBatch } from '@/lib/alphaOmegaPaper/simulateSpeedfloorPaperBatch';
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
      ? body.tradeIds.filter((id) => typeof id === 'string').slice(0, 40)
      : [];
    if (tradeIds.length === 0) {
      return NextResponse.json({ outcomes: {}, givebackEnabled: false });
    }

    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from('bridge_trade_log')
      .select(
        'id,signal_id,direction,decision,block_reason,lane_advisory,status,' +
          'entry_price,stop_loss,account_equity_at_signal,signal_received_at,created_at,broker_id',
      )
      .in('id', tradeIds);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as BridgeTradeLogRow[];
    const inputs = rows
      .filter(isSpeedfloorShadowRow)
      .map(mapTradeToPaperInput)
      .filter((row): row is NonNullable<typeof row> => row != null);

    const batch = await simulateSpeedfloorPaperBatch(supabase, inputs);
    return NextResponse.json(batch);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
