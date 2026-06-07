import { getSupabase } from '@/lib/supabase';
import type { PdlSweepSignalRow } from '@/lib/pdlSweepTypes';
import { PDL_SWEEP_PAIR } from '@/lib/pdlSweepConstants';

export async function fetchPdlSweepSignals(): Promise<PdlSweepSignalRow[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('pdl_sweep_signals')
    .select('*')
    .eq('pair', PDL_SWEEP_PAIR)
    .order('trade_date', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as PdlSweepSignalRow[];
}
