'use client';

import type { BridgeBrokerRow } from '@/lib/types';

interface Mt5BrokerHealthSectionProps {
  brokers: BridgeBrokerRow[];
}

function statusLabel(broker: BridgeBrokerRow): { label: string; dot: string } {
  const hasUuid = Boolean(broker.account_id && !String(broker.account_id).startsWith('ENV:'));
  if (broker.connection_status === 'connected') {
    return { label: 'Connected', dot: 'bg-emerald-500' };
  }
  if (!hasUuid && !broker.last_heartbeat_at) {
    return { label: 'Not probed', dot: 'bg-slate-400' };
  }
  return {
    label: broker.connection_status ?? 'Disconnected',
    dot: 'bg-red-500',
  };
}

export function Mt5BrokerHealthSection({ brokers }: Mt5BrokerHealthSectionProps) {
  const mt5Brokers = brokers.filter((broker) => broker.broker_id.startsWith('vtmarkets_'));
  if (!mt5Brokers.length) return null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-medium text-slate-700">MT5 (VT Markets)</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {mt5Brokers.map((broker) => {
          const status = statusLabel(broker);
          return (
            <div
              key={broker.broker_id}
              className="rounded border border-slate-100 bg-slate-50 p-3"
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                <span className="text-sm font-medium text-slate-800">{broker.display_name}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{broker.broker_id}</p>
              <p className="mt-2 text-sm text-slate-600">{status.label}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        AO VT: Settings → Connect VT Markets. Rollback: disable VT links, or MT5_ENABLED=false on
        Railway.
      </p>
    </section>
  );
}
