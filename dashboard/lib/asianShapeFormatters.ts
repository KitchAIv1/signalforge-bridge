import type { AmdState } from '@/lib/types';

export function asianShapeLabel(shape: AmdState['asian_shape']): string {
  if (!shape) return '—';
  return shape.replace(/-/g, ' ');
}

export function formatAsianTurnTimeUtc(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  const hours = parsed.getUTCHours().toString().padStart(2, '0');
  const minutes = parsed.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes} UTC`;
}

export function formatAsianTurnPosition(fraction: number | null | undefined): string {
  if (fraction == null) return '—';
  return `${(fraction * 100).toFixed(1)}% of session`;
}
