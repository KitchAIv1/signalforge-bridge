export type BrokerVenueKind = 'oanda' | 'mt5';

export interface BrokerVenueDisplay {
  kind: BrokerVenueKind;
  label: 'OANDA' | 'MT5';
}

/** Maps bridge_trade_log.broker_id to a short Activity badge label. */
export function resolveBrokerVenueDisplay(brokerId: string | null | undefined): BrokerVenueDisplay {
  const normalized = (brokerId ?? 'oanda_practice').toLowerCase();
  if (normalized.includes('vtmarkets') || normalized.includes('mt5')) {
    return { kind: 'mt5', label: 'MT5' };
  }
  return { kind: 'oanda', label: 'OANDA' };
}
