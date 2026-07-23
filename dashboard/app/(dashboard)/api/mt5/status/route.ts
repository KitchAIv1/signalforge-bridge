import { NextResponse } from 'next/server';
import { loadAoVtBrokerSnapshot } from '@/lib/mt5/aoVtBindService';
import { buildMt5ApiSupabase } from '@/lib/mt5/buildMt5ApiSupabase';
import { OMEGA_AO_VT_BROKER_ID } from '@/lib/omegaLaneBConstants';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = buildMt5ApiSupabase();
    const snapshot = await loadAoVtBrokerSnapshot(supabase);
    return NextResponse.json({
      brokerId: OMEGA_AO_VT_BROKER_ID,
      snapshot,
      mt5Enabled: process.env.MT5_ENABLED === 'true',
      hasMetaApiToken: Boolean(process.env.METAAPI_TOKEN?.trim()),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
