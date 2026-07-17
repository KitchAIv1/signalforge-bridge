/** Friendly display labels for Activity / Overview engine_id values. */

const ENGINE_DISPLAY_LABELS: Record<string, string> = {
  omega: 'Omega',
  omega_inverse: 'Omega Inverse',
  engine_rebuild: 'Rebuild',
  engine_amd: 'AMD',
  audusd_fade: 'AUD Fade',
  pdl_window: 'PDL Window',
  scalper: 'Scalper',
  falcon: 'Falcon',
  sigma: 'Sigma',
};

export function engineDisplayLabel(engineId: string | null | undefined): string {
  if (!engineId) return '—';
  return ENGINE_DISPLAY_LABELS[engineId] ?? engineId;
}
