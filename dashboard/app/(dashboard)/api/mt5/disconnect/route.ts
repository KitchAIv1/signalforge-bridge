import { NextResponse } from 'next/server';
import { OMEGA_AO_VT_BROKER_ID } from '@/lib/omegaLaneBConstants';
import {
  loadAoVtBrokerSnapshot,
  persistAoVtDisconnect,
} from '@/lib/mt5/aoVtBindService';
import { buildMt5ApiSupabase } from '@/lib/mt5/buildMt5ApiSupabase';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  try {
    const supabase = buildMt5ApiSupabase();
    const before = await loadAoVtBrokerSnapshot(supabase);
    if (!before) {
      return NextResponse.json(
        { error: `Broker ${OMEGA_AO_VT_BROKER_ID} missing` },
        { status: 404 },
      );
    }

    await persistAoVtDisconnect(supabase);
    const snapshot = await loadAoVtBrokerSnapshot(supabase);

    return NextResponse.json({
      ok: true,
      brokerId: OMEGA_AO_VT_BROKER_ID,
      snapshot,
      note:
        'AO VT route deactivated. Open VT positions (if any) remain at the broker — close via MetaApi/MT5. Bridge will fail-closed on those tickets (no OANDA fallback).',
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
