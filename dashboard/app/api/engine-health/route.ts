import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function buildSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment for engine health route');
  }

  return createClient(supabaseUrl, supabaseKey);
}

interface EngineHealthRow {
  service: string;
  status: string;
  last_attempt_at: string;
  last_success_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
}

interface BridgeHealthRow {
  oanda_ok: boolean;
  supabase_ok: boolean;
  broker_connection_status: string | null;
  checked_at: string;
}

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = buildSupabaseClient();

    const [engineRes, bridgeRes] = await Promise.all([
      supabase
        .from('engine_oanda_health')
        .select('service, status, last_attempt_at, last_success_at, consecutive_failures, last_error'),
      supabase
        .from('bridge_health_log')
        .select('oanda_ok, supabase_ok, broker_connection_status, checked_at')
        .order('checked_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const engineRows = (engineRes.data ?? []) as EngineHealthRow[];
    const omega = engineRows.find((r) => r.service === 'omega') ?? null;
    const rebuild = engineRows.find((r) => r.service === 'rebuild') ?? null;
    const bridge = (bridgeRes.data ?? null) as BridgeHealthRow | null;

    return NextResponse.json({ omega, rebuild, bridge });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
