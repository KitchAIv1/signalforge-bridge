'use client';

import { useEffect, useState } from 'react';
import { Mt5SymbolSuffixField } from '@/components/broker/Mt5SymbolSuffixField';
import type { useConnectAoVtAccount } from '@/hooks/useConnectAoVtAccount';

type ConnectState = ReturnType<typeof useConnectAoVtAccount>;

export function ConnectAoVtConnectedCard({
  state,
  routeOn,
}: {
  state: ConnectState;
  routeOn: boolean;
}) {
  const [suffixDraft, setSuffixDraft] = useState(state.snapshot?.symbolSuffix ?? '-STD');
  const probe = state.lastProbe;

  useEffect(() => {
    if (state.snapshot?.symbolSuffix) setSuffixDraft(state.snapshot.symbolSuffix);
  }, [state.snapshot?.symbolSuffix]);

  return (
    <div className="mt-4 rounded border border-slate-100 bg-slate-50/80 p-3">
      <p className="text-sm font-medium text-slate-800">
        {routeOn ? 'Route active' : 'Bound (route off)'} ·{' '}
        {state.snapshot?.connectionStatus ?? 'unknown'}
      </p>
      <p className="mt-1 break-all font-mono text-xs text-slate-600">{state.snapshot?.accountId}</p>
      {probe ? (
        <p className="mt-2 text-xs text-slate-600">
          Equity {probe.equity ?? '—'} · Balance {probe.balance ?? '—'} · Open{' '}
          {probe.openPositions ?? '—'}
          {probe.audusdSymbols?.length
            ? ` · Symbols ${probe.audusdSymbols.join(', ')}`
            : ''}
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        <Mt5SymbolSuffixField
          value={suffixDraft}
          onChange={setSuffixDraft}
          disabled={state.busy}
          inferredSuffix={probe?.inferredSuffix ?? null}
          hint="Saved on this broker row. Bridge orders AUDUSD{suffix} (hyphen form)."
        />
        <button
          type="button"
          onClick={() => void state.saveSuffix(suffixDraft)}
          disabled={state.busy || suffixDraft === state.snapshot?.symbolSuffix}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Save suffix
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void state.probe()}
          disabled={state.busy}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Re-probe
        </button>
        <button
          type="button"
          onClick={() => void state.disconnect()}
          disabled={state.busy}
          className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        >
          Disconnect VT AO
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Override terminal remains OANDA AO only. Disconnect deactivates the VT route; it does not
        store or need your VT password.
      </p>
    </div>
  );
}
