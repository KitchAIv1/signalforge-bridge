'use client';

import { useEffect, useState } from 'react';

interface EngineHealthRow {
  service: string;
  status: string;
  last_attempt_at: string;
  last_success_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
}

interface BridgeHealthRow {
  oanda_ok: boolean;
  broker_connection_status: string | null;
  checked_at: string;
}

interface HealthPayload {
  omega: EngineHealthRow | null;
  rebuild: EngineHealthRow | null;
  bridge: BridgeHealthRow | null;
}

function formatTimeAgo(iso: string | null): string {
  if (!iso) return '—';
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

type DotColor = 'green' | 'amber' | 'red' | 'grey';

function engineDotColor(row: EngineHealthRow | null): DotColor {
  if (!row) return 'grey';
  const ageMs = Date.now() - new Date(row.last_attempt_at).getTime();
  if (ageMs > 30 * 60 * 1000) return 'grey';
  if (row.consecutive_failures >= 3) return 'red';
  if (row.consecutive_failures >= 1) return 'amber';
  if (row.status !== 'ok') return 'grey';
  const successAgeMs = row.last_success_at
    ? Date.now() - new Date(row.last_success_at).getTime()
    : Infinity;
  if (successAgeMs > 30 * 60 * 1000) return 'amber';
  if (successAgeMs > 15 * 60 * 1000) return 'amber';
  return 'green';
}

function bridgeDotColor(row: BridgeHealthRow | null): DotColor {
  if (!row) return 'grey';
  const ageMs = Date.now() - new Date(row.checked_at).getTime();
  if (ageMs > 5 * 60 * 1000) return 'grey';
  return row.oanda_ok ? 'green' : 'red';
}

const DOT_CLASS: Record<DotColor, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-400',
  red: 'bg-red-500',
  grey: 'bg-slate-300',
};

function Dot({ color }: { color: DotColor }) {
  return <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${DOT_CLASS[color]}`} />;
}

interface ServiceRowProps {
  label: string;
  dot: DotColor;
  lastSuccess: string | null;
  failures: number;
  lastError: string | null;
  noRecentData: boolean;
}

function ServiceRow({ label, dot, lastSuccess, failures, lastError, noRecentData }: ServiceRowProps) {
  return (
    <div className="flex items-start gap-2 py-1">
      <Dot color={dot} />
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        {noRecentData ? (
          <p className="text-xs text-slate-400">No recent data</p>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              Last success: {formatTimeAgo(lastSuccess)}
            </p>
            {failures > 0 && (
              <p className="text-xs text-red-600">{failures} consecutive failure{failures !== 1 ? 's' : ''}</p>
            )}
            {lastError && dot !== 'green' && (
              <p className="truncate text-xs text-slate-400" title={lastError}>
                {lastError.slice(0, 60)}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function OandaConnectionStatus() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<HealthPayload | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/engine-health');
        if (res.ok) setPayload((await res.json()) as HealthPayload);
      } catch {
        // silent — stale data shown
      }
    };
    void fetchHealth();
    const interval = setInterval(() => void fetchHealth(), 30_000);
    return () => clearInterval(interval);
  }, []);

  const omegaDot = engineDotColor(payload?.omega ?? null);
  const rebuildDot = engineDotColor(payload?.rebuild ?? null);
  const bridgeDot = bridgeDotColor(payload?.bridge ?? null);

  const anyDegraded = omegaDot === 'red' || rebuildDot === 'red' ||
    omegaDot === 'amber' || rebuildDot === 'amber' || bridgeDot !== 'green';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded border px-2.5 py-1.5 text-xs font-medium transition-colors ${
          anyDegraded
            ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
        }`}
        title="OANDA fetch health — click to expand"
      >
        <span className="flex items-center gap-1">
          <Dot color={omegaDot} />
          <Dot color={rebuildDot} />
          <Dot color={bridgeDot} />
        </span>
        <span>OANDA</span>
        <span className="text-slate-400">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">OANDA Fetch Health</span>
            <span className="text-xs text-slate-400">30s refresh</span>
          </div>
          <div className="divide-y divide-slate-100">
            <ServiceRow
              label="Omega (AUDUSD M5)"
              dot={omegaDot}
              lastSuccess={payload?.omega?.last_success_at ?? null}
              failures={payload?.omega?.consecutive_failures ?? 0}
              lastError={payload?.omega?.last_error ?? null}
              noRecentData={omegaDot === 'grey'}
            />
            <ServiceRow
              label="Rebuild (GBPUSD M5)"
              dot={rebuildDot}
              lastSuccess={payload?.rebuild?.last_success_at ?? null}
              failures={payload?.rebuild?.consecutive_failures ?? 0}
              lastError={payload?.rebuild?.last_error ?? null}
              noRecentData={rebuildDot === 'grey'}
            />
            <ServiceRow
              label="Bridge (OANDA API)"
              dot={bridgeDot}
              lastSuccess={payload?.bridge?.checked_at ?? null}
              failures={0}
              lastError={null}
              noRecentData={bridgeDot === 'grey'}
            />
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 w-full text-center text-xs text-slate-400 hover:text-slate-600"
          >
            close
          </button>
        </div>
      )}
    </div>
  );
}
