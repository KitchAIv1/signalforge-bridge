export function omegaPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function omegaR2(n: number | null): string {
  if (n === null) return '—';
  return n.toFixed(2);
}

export function omegaFmtTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    hour12: false,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function omegaDaysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
