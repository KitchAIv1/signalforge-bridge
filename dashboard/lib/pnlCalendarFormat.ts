function asUtcDateKey(ms: number): string {
  return new Date(ms).toISOString().split('T')[0];
}

export function toDateKeyFromInput(d: Date | string): string {
  if (typeof d === 'string') return new Date(d).toISOString().split('T')[0];
  return d.toISOString().split('T')[0];
}

export function toDateKeyNow(): string {
  return asUtcDateKey(Date.now());
}

export function getRValue(val: number): string {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}R`;
}

export function getDollarValue(val: number, hasNull: boolean): string {
  const sign = val >= 0 ? '+' : '';
  const str = `${sign}$${Math.abs(val).toFixed(0)}`;
  return hasNull ? `~${str}` : str;
}

export function getRColor(val: number): string {
  if (val > 0) return '#10b981';
  if (val < 0) return '#f43f5e';
  return '#64748b';
}

export function getCellBg(val: number, tradeCount: number): string {
  if (tradeCount === 0) return 'transparent';
  const intensity = Math.min(Math.abs(val) / 10, 1);
  if (val > 0) return `rgba(16,185,129,${0.04 + intensity * 0.14})`;
  if (val < 0) return `rgba(244,63,94,${0.04 + intensity * 0.14})`;
  return 'rgba(100,116,139,0.05)';
}

export function getCellBorder(val: number, tradeCount: number, selected: boolean): string {
  if (selected) return '1px solid #3b82f6';
  if (tradeCount === 0) return '1px solid #1e2d3d';
  if (val > 0) return '1px solid rgba(16,185,129,0.25)';
  if (val < 0) return '1px solid rgba(244,63,94,0.25)';
  return '1px solid #1e2d3d';
}

export function getDaysInMonthUtc(year: number, month: number): Date[] {
  const days: Date[] = [];
  const cursor = new Date(Date.UTC(year, month, 1));
  while (cursor.getUTCMonth() === month) {
    days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function shiftMonthStartUtc(anchor: Date, deltaMonths: number): Date {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth() + deltaMonths;
  return new Date(Date.UTC(y, m, 1));
}
