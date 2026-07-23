'use client';

import { FormEvent, useState } from 'react';
import { ConnectAoVtConnectedCard } from '@/components/broker/ConnectAoVtConnectedCard';
import { Mt5SymbolSuffixField } from '@/components/broker/Mt5SymbolSuffixField';
import { OMEGA_AO_VT_BROKER_ID } from '@/lib/omegaLaneBConstants';
import { useConnectAoVtAccount } from '@/hooks/useConnectAoVtAccount';

function hasBoundUuid(accountId: string | null | undefined): boolean {
  return Boolean(accountId && !accountId.startsWith('ENV:'));
}

export function ConnectAoVtPanel() {
  const state = useConnectAoVtAccount();
  const [uuidInput, setUuidInput] = useState('');
  const [suffixInput, setSuffixInput] = useState('-STD');
  const bound = hasBoundUuid(state.snapshot?.accountId);
  const routeOn = Boolean(state.snapshot?.linkActive && state.snapshot?.isActive);

  async function handleBind(event: FormEvent) {
    event.preventDefault();
    const ok = await state.bind(uuidInput.trim(), suffixInput);
    if (ok) setUuidInput('');
  }

  if (state.loading) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-500">Loading VT connect…</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-medium text-slate-700">Connect VT Markets (ALPHAOMEGA)</h2>
      <p className="mt-1 text-xs text-slate-500">
        Guided bind for <span className="font-mono">{OMEGA_AO_VT_BROKER_ID}</span>. Paste the
        MetaApi <strong>account UUID</strong> (not the MT5 login). Choose the account-type symbol
        suffix so orders hit <span className="font-mono">AUDUSD-STD</span> (etc.), not VIP demo
        symbols.
      </p>

      <HowToSteps />
      <EnvHints mt5Enabled={state.mt5Enabled} hasMetaApiToken={state.hasMetaApiToken} />

      {bound ? (
        <ConnectAoVtConnectedCard state={state} routeOn={routeOn} />
      ) : (
        <form onSubmit={(event) => void handleBind(event)} className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-slate-600">
            MetaApi account UUID
            <input
              type="text"
              value={uuidInput}
              onChange={(event) => setUuidInput(event.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
              disabled={state.busy}
              required
            />
          </label>
          <Mt5SymbolSuffixField
            value={suffixInput}
            onChange={setSuffixInput}
            disabled={state.busy}
            hint="Live Standard STP = -STD. Demo VIP books use -VIP."
          />
          <button
            type="submit"
            disabled={state.busy || !uuidInput.trim()}
            className="rounded bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {state.busy ? 'Connecting…' : 'Bind & probe'}
          </button>
        </form>
      )}

      {state.errorMessage ? (
        <p className="mt-3 text-sm text-red-600">{state.errorMessage}</p>
      ) : null}
      {state.warnings.map((warning) => (
        <p key={warning} className="mt-2 text-xs text-amber-700">
          {warning}
        </p>
      ))}
      {state.note ? <p className="mt-2 text-xs text-slate-600">{state.note}</p> : null}
    </section>
  );
}

function HowToSteps() {
  return (
    <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-slate-600">
      <li>Open / confirm your VT Markets MT5 live account (login, server, password).</li>
      <li>In MetaApi (London region), add that MT5 account and wait until Connected.</li>
      <li>In MT5 Market Watch, enable the tradable symbol (e.g. AUDUSD-STD).</li>
      <li>Copy the MetaApi account ID (UUID), pick the matching suffix, and bind.</li>
    </ol>
  );
}

function EnvHints({
  mt5Enabled,
  hasMetaApiToken,
}: {
  mt5Enabled: boolean;
  hasMetaApiToken: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 text-xs">
      <span
        className={`rounded px-2 py-1 ${hasMetaApiToken ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}
      >
        METAAPI_TOKEN: {hasMetaApiToken ? 'present' : 'missing on dashboard'}
      </span>
      <span
        className={`rounded px-2 py-1 ${mt5Enabled ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}
      >
        MT5_ENABLED: {mt5Enabled ? 'true' : 'false (bridge needs true to execute)'}
      </span>
    </div>
  );
}
