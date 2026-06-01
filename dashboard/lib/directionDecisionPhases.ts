import type { SessionPhase } from '@/lib/directionDecisionTypes';

function utcNowParts(): { hour: number; minute: number } {
  const now = new Date();
  return { hour: now.getUTCHours(), minute: now.getUTCMinutes() };
}

export function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function resolveAsianSessionPhase(): SessionPhase {
  const { hour } = utcNowParts();
  if (hour < 8) return 'active';
  return 'completed';
}

export function resolveDistributionSessionPhase(): SessionPhase {
  const { hour, minute } = utcNowParts();
  const decimal = hour + minute / 60;
  if (decimal < 10) return 'pending';
  if (decimal < 16) return 'active';
  return 'completed';
}

export function utcHourNow(): number {
  return utcNowParts().hour;
}

export function isForexWeekendClosed(): boolean {
  const now = new Date();
  const day = now.getUTCDay();
  const decimal = now.getUTCHours() + now.getUTCMinutes() / 60;
  return day === 6 || (day === 0 && decimal < 21) || (day === 5 && decimal >= 21);
}
