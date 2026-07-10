import { OMEGA_LANE_B_BROKER_ID } from '@/lib/omegaLaneBConstants';

/** Lane A Override / Activity OANDA practice account. */
export const OMEGA_LANE_A_BROKER_ID = 'oanda_practice';

const OVERRIDE_BROKER_IDS = new Set([OMEGA_LANE_A_BROKER_ID, OMEGA_LANE_B_BROKER_ID]);

export type OverrideBrokerId = typeof OMEGA_LANE_A_BROKER_ID | typeof OMEGA_LANE_B_BROKER_ID;

export function isOverrideBrokerId(value: string): value is OverrideBrokerId {
  return OVERRIDE_BROKER_IDS.has(value);
}

/** Parse brokerId from query/body; default Lane A for backward compatibility. */
export function resolveOverrideBrokerId(
  raw: string | null | undefined,
): OverrideBrokerId {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return OMEGA_LANE_A_BROKER_ID;
  if (!isOverrideBrokerId(trimmed)) {
    throw new Error(
      `Unsupported override brokerId "${trimmed}". Allowed: ${[...OVERRIDE_BROKER_IDS].join(', ')}`,
    );
  }
  return trimmed;
}

/** bridge_trade_log filter: Lane A may have null broker_id on older rows. */
export function tradeLogBrokerFilter(brokerId: OverrideBrokerId): string {
  if (brokerId === OMEGA_LANE_A_BROKER_ID) {
    return `broker_id.is.null,broker_id.eq.${OMEGA_LANE_A_BROKER_ID}`;
  }
  return `broker_id.eq.${brokerId}`;
}
