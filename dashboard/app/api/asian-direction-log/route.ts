import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { AsianDirectionLogEntry } from '@/lib/fetchAsianDirectionLog';

const DIRECTION_SET_SELECT =
  'trade_date, triggered_at, amd_tag, prior_d1_direction, direction_set, ' +
  'previous_direction, direction_changed, action, reason, asian_session_result, created_at';

export const dynamic = 'force-dynamic';

function buildSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  // Prefer service key (bypasses RLS) but fall back to anon key so production
  // environments that only expose NEXT_PUBLIC_ vars still work.
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment for Asian direction log');
  }

  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = buildSupabaseClient();
    const { data: queriedRows, error } = await supabase
      .from('asian_direction_log')
      .select(DIRECTION_SET_SELECT)
      .eq('trigger_type', 'DIRECTION_SET')
      .order('created_at', { ascending: false })
      .limit(25);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json((queriedRows ?? []) as unknown as AsianDirectionLogEntry[]);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
