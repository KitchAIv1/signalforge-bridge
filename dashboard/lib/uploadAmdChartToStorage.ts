import { getSupabase } from '@/lib/supabase';

export async function uploadAmdChartToStorage(
  tradeDate: string,
  pngBlob: Blob
): Promise<string | null> {
  try {
    const supabase = getSupabase();
    const fileName = `${tradeDate}/AUDUSD_H1_AMD.png`;
    const bucket = 'amd-charts';

    const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, pngBlob, {
      contentType: 'image/png',
      upsert: true,
    });

    if (uploadError) {
      console.warn('[AmdChart] Storage upload failed:', uploadError.message);
      return null;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);

    return data.publicUrl ?? null;
  } catch (err: unknown) {
    console.warn('[AmdChart] Upload error:', err);
    return null;
  }
}
