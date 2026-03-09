/**
 * Circuit breaker: kill_switch, drawdown from peak, consecutive losses, cooldown.
 */

export interface CircuitBreakerState {
  killSwitch: boolean;
  peakEquity: number;
  consecutiveLosses: number;
  cooldownEndAt: Date | null;
}

let state: CircuitBreakerState = {
  killSwitch: false,
  peakEquity: 0,
  consecutiveLosses: 0,
  cooldownEndAt: null,
};

export function initCircuitBreaker(killSwitch: boolean, currentEquity: number): void {
  state = {
    killSwitch,
    peakEquity: currentEquity,
    consecutiveLosses: 0,
    cooldownEndAt: null,
  };
}

export function updateKillSwitch(on: boolean): void {
  state.killSwitch = on;
}

export function updatePeakEquity(equity: number): void {
  if (equity > state.peakEquity) state.peakEquity = equity;
}

export function recordClosedTrade(result: 'win' | 'loss' | 'breakeven'): void {
  if (result === 'loss') state.consecutiveLosses += 1;
  else state.consecutiveLosses = 0;
}

export function enterCooldown(minutes: number): void {
  const end = new Date();
  end.setMinutes(end.getMinutes() + minutes);
  state.cooldownEndAt = end;
}

export function isCooldownActive(now: Date = new Date()): boolean {
  return state.cooldownEndAt !== null && now < state.cooldownEndAt;
}

export function getConsecutiveLosses(): number {
  return state.consecutiveLosses;
}

export interface TripReason {
  tripped: boolean;
  reason?: string;
}

export function isTripped(
  drawdownPct: number,
  drawdownLimitPct: number,
  consecutiveLossLimit: number,
  cooldownMinutes: number,
  now: Date = new Date()
): TripReason {
  if (state.killSwitch) return { tripped: true, reason: 'Kill switch active' };
  if (drawdownPct >= drawdownLimitPct) return { tripped: true, reason: `Circuit breaker: drawdown ${(drawdownPct * 100).toFixed(1)}% exceeds limit` };
  if (state.consecutiveLosses >= consecutiveLossLimit && isCooldownActive(now)) {
    const minsLeft = state.cooldownEndAt ? Math.ceil((state.cooldownEndAt.getTime() - now.getTime()) / 60000) : 0;
    return { tripped: true, reason: `Cooldown active: ${minsLeft} minutes remaining` };
  }
  return { tripped: false };
}

export function getPeakEquity(): number {
  return state.peakEquity;
}
