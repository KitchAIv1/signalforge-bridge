import { getSupabase } from '@/lib/supabase';

export async function updateAmdChartUrl(amdStateId: string, chartUrl: string): Promise<void> {
  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('amd_state')
      .update({
        chart_url: chartUrl,
        chart_generated_at: new Date().toISOString(),
      })
      .eq('id', amdStateId);

    if (error) {
      console.warn('[AmdChart] chart_url update failed:', error.message);
    }
  } catch (err: unknown) {
    console.warn('[AmdChart] updateAmdChartUrl error:', err);
  }
}
