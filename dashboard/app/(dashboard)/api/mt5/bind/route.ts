import { NextResponse } from 'next/server';
import { OMEGA_AO_VT_BROKER_ID } from '@/lib/omegaLaneBConstants';
import { persistAoVtBindSuccess, loadAoVtBrokerSnapshot } from '@/lib/mt5/aoVtBindService';
import { buildMt5ApiSupabase } from '@/lib/mt5/buildMt5ApiSupabase';
import { isMetaApiAccountUuid, probeMetaApiAccount } from '@/lib/mt5/metaApiAccountProbe';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface BindBody {
  metaApiAccountId?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as BindBody;
    const metaApiAccountId = (body.metaApiAccountId ?? '').trim();
    if (!isMetaApiAccountUuid(metaApiAccountId)) {
      return NextResponse.json(
        { error: 'Paste a valid MetaApi account UUID (not the MT5 login number).' },
        { status: 400 },
      );
    }

    const supabase = buildMt5ApiSupabase();
    const existing = await loadAoVtBrokerSnapshot(supabase);
    if (!existing) {
      return NextResponse.json(
        {
          error: `Broker ${OMEGA_AO_VT_BROKER_ID} missing — run migration 063_vtmarkets_ao_live.sql`,
        },
        { status: 404 },
      );
    }

    const probe = await probeMetaApiAccount(metaApiAccountId);
    if (!probe.ok) {
      return NextResponse.json(
        { error: probe.error ?? 'MetaApi probe failed', probe },
        { status: 502 },
      );
    }

    await persistAoVtBindSuccess(supabase, metaApiAccountId);
    const snapshot = await loadAoVtBrokerSnapshot(supabase);
    const mt5Enabled = process.env.MT5_ENABLED === 'true';

    return NextResponse.json({
      ok: true,
      brokerId: OMEGA_AO_VT_BROKER_ID,
      probe,
      snapshot,
      warnings: mt5Enabled
        ? []
        : ['MT5_ENABLED is not true on this server — set MT5_ENABLED=true on the bridge process for live execution.'],
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
