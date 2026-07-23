import { NextResponse } from 'next/server';
import { OMEGA_AO_VT_BROKER_ID } from '@/lib/omegaLaneBConstants';
import {
  loadAoVtBrokerSnapshot,
  persistAoVtSymbolSuffix,
} from '@/lib/mt5/aoVtBindService';
import { buildMt5ApiSupabase } from '@/lib/mt5/buildMt5ApiSupabase';
import { normalizeMt5SymbolSuffix } from '@/lib/mt5/mt5SymbolSuffix';

export const dynamic = 'force-dynamic';

interface SuffixBody {
  symbolSuffix?: string;
}

/** Update per-broker MT5 symbol suffix without re-binding MetaApi UUID. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as SuffixBody;
    const symbolSuffix = normalizeMt5SymbolSuffix(body.symbolSuffix);
    if (!symbolSuffix) {
      return NextResponse.json(
        { error: 'symbolSuffix required — use -STD, -VIP, or -ECN (AUDUSD_STD also accepted).' },
        { status: 400 },
      );
    }

    const supabase = buildMt5ApiSupabase();
    const existing = await loadAoVtBrokerSnapshot(supabase);
    if (!existing) {
      return NextResponse.json(
        { error: `Broker ${OMEGA_AO_VT_BROKER_ID} missing` },
        { status: 404 },
      );
    }

    await persistAoVtSymbolSuffix(supabase, symbolSuffix);
    const snapshot = await loadAoVtBrokerSnapshot(supabase);
    return NextResponse.json({ ok: true, brokerId: OMEGA_AO_VT_BROKER_ID, snapshot });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
