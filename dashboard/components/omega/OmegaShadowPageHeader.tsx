import { SHADOW_START_DATE } from '@/lib/omegaShadowConstants';
import { omegaDaysSince } from '@/lib/omegaShadowFormat';

export function OmegaShadowPageHeader() {
  const daysShadow = omegaDaysSince(SHADOW_START_DATE);
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Omega Shadow</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Pattern:{' '}
          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
            omega_AUDUSD_M5_w3_c5
          </span>
          &nbsp;·&nbsp;Live since Apr 7 2026 ({daysShadow}d)
          &nbsp;·&nbsp;Threshold: 3.2306
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs text-slate-500">Shadow active — no execution</span>
      </div>
    </div>
  );
}
