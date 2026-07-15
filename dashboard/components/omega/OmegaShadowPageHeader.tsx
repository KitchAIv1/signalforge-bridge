import { SHADOW_START_DATE } from '@/lib/omegaShadowConstants';
import { omegaDaysSince } from '@/lib/omegaShadowFormat';
import {
  OMEGA_CENTROID_DEFAULT_THRESHOLD,
  OMEGA_CENTROID_PATTERN_ID,
} from '@/lib/omegaCentroidConstants';

/** Stale w3/c5 labels removed — display mirrors live w5/c0 only. */
export function OmegaShadowPageHeader() {
  const daysShadow = omegaDaysSince(SHADOW_START_DATE);
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Omega Shadow</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Pattern:{' '}
          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
            {OMEGA_CENTROID_PATTERN_ID}
          </span>
          &nbsp;·&nbsp;Live since Apr 7 2026 ({daysShadow}d)
          &nbsp;·&nbsp;w5/c0 freeze Jun 18 · Threshold:{' '}
          {OMEGA_CENTROID_DEFAULT_THRESHOLD.toFixed(4)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs text-slate-500">Shadow active — no execution</span>
      </div>
    </div>
  );
}
