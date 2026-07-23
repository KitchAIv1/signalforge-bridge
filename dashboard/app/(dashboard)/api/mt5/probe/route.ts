import { NextResponse } from 'next/server';
import { OMEGA_AO_VT_BROKER_ID } from '@/lib/omegaLaneBConstants';
import {
  loadAoVtBrokerSnapshot,
  persistAoVtProbeStatus,
} from '@/lib/mt5/aoVtBindService';
import { buildMt5ApiSupabase } from '@/lib/mt5/buildMt5ApiSupabase';
import { probeMetaApiAccount } from '@/lib/mt5/metaApiAccountProbe';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(): Promise<NextResponse> {
  try {
    const supabase = buildMt5ApiSupabase();
    const snapshot = await loadAoVtBrokerSnapshot(supabase);
    if (!snapshot?.accountId || snapshot.accountId.startsWith('ENV:')) {
      return NextResponse.json(
        { error: `No MetaApi UUID bound on ${OMEGA_AO_VT_BROKER_ID}` },
        { status: 400 },
      );
    }

    const probe = await probeMetaApiAccount(snapshot.accountId);
    await persistAoVtProbeStatus(supabase, probe.ok);
    const refreshed = await loadAoVtBrokerSnapshot(supabase);

    return NextResponse.json({
      ok: probe.ok,
      brokerId: OMEGA_AO_VT_BROKER_ID,
      probe,
      snapshot: refreshed,
      error: probe.error,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
