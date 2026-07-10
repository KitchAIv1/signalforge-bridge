import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchOpenTrades } from '@/lib/oandaClient';
import { enrichOpenTradesWithLegMetadata } from '@/lib/overrideTradeLogEnrichment';
import {
  resolveOverrideBrokerId,
  tradeLogBrokerFilter,
} from '@/lib/overrideBrokerScope';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials for override positions route');
  }

  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const brokerId = resolveOverrideBrokerId(searchParams.get('brokerId'));
    const trades = await fetchOpenTrades(brokerId);
    const oandaIds = trades.map((trade) => trade.id);

    if (oandaIds.length === 0) {
      return NextResponse.json({ trades: [], brokerId });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: logRows, error: queryError } = await supabaseAdmin
      .from('bridge_trade_log')
      .select('oanda_trade_id, leg_type, signal_id, engine_id')
      .in('oanda_trade_id', oandaIds)
      .or(tradeLogBrokerFilter(brokerId));

    if (queryError) {
      throw new Error(queryError.message);
    }

    const enrichedTrades = enrichOpenTradesWithLegMetadata(trades, logRows ?? []);
    return NextResponse.json({ trades: enrichedTrades, brokerId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
