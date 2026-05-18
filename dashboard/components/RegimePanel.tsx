'use client';

import { useRegimeState } from '@/hooks/useRegimeState';
import {
  alertClasses,
  alertMessage,
  computeAlertVariant,
  computeNextUpdateUTC,
  confidenceColorClass,
  formatUTCTime,
  layer4Label,
  layer5Label,
  layer6Label,
} from '@/lib/regimePanelFormatters';

export function RegimePanel() {
  const {
    regimeState,
    omegaDirection,
    directionMode,
    isLoading,
    fetchError,
    flipDirection,
  } = useRegimeState();

  if (isLoading) {
    return (
      <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-sm text-slate-400 dark:text-slate-300">
        Loading regime data…
      </div>
    );
  }

  if (fetchError || !regimeState) {
    return (
      <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
        Regime data unavailable {fetchError ? `— ${fetchError}` : ''}
      </div>
    );
  }

  const l4 = layer4Label(
    regimeState.layer4_result ?? '',
    regimeState.layer4_bullish_count ?? 0,
    regimeState.layer4_bearish_count ?? 0
  );
  const l5 = layer5Label(regimeState.layer5_result ?? '', regimeState.layer5_pip_diff ?? 0);
  const l6 = layer6Label(regimeState.layer6_position_pct ?? 0);

  const variant = computeAlertVariant(
    regimeState.regime_confidence,
    regimeState.regime_direction,
    omegaDirection
  );
  const alert   = alertClasses(variant);
  const message = alertMessage(
    variant,
    regimeState.regime_confidence,
    regimeState.regime_direction,
    omegaDirection
  );

  return (
    <div className="mb-4 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-300">
        Omega regime — AUD/USD
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
          <p className="text-xs text-slate-400 dark:text-slate-300 mb-1">D1 trend (L4)</p>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {l4.symbol} {l4.label}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-300 mt-0.5">{l4.detail}</p>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
          <p className="text-xs text-slate-400 dark:text-slate-300 mb-1">H4 structure (L5)</p>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {l5.symbol} {l5.label}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-300 mt-0.5">{l5.detail}</p>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
          <p className="text-xs text-slate-400 dark:text-slate-300 mb-1">Range position (L6)</p>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{l6.label}</p>
          <p className="text-xs text-slate-400 dark:text-slate-300 mt-0.5">{l6.detail}</p>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
          <p className="text-xs text-slate-400 dark:text-slate-300 mb-1">Confidence</p>
          <p className={`text-sm font-medium ${confidenceColorClass(regimeState.regime_confidence)}`}>
            {regimeState.regime_confidence.charAt(0) +
              regimeState.regime_confidence.slice(1).toLowerCase()}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-300 mt-0.5">
            {regimeState.choppy_extended_override ? 'Choppy-extended' : 'Normal'}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
          <p className="text-xs text-slate-400 dark:text-slate-300 mb-1">Suggested direction</p>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {regimeState.regime_direction === 'LONG'
              ? '↑ Long'
              : regimeState.regime_direction === 'SHORT'
                ? '↓ Short'
                : '— Pause'}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-300 mt-0.5">Active: {omegaDirection}</p>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
          <p className="text-xs text-slate-400 dark:text-slate-300 mb-1">Next update</p>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {computeNextUpdateUTC(regimeState.evaluated_at)}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-300 mt-0.5">Last: {formatUTCTime(regimeState.evaluated_at)}</p>
        </div>
      </div>

      <div className={`rounded-lg border px-3 py-2 flex items-center justify-between gap-3 ${alert.bg}`}>
        <p className={`text-xs flex-1 ${alert.text}`}>{message}</p>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs text-slate-400 dark:text-slate-300">Direction:</span>
          <button
            type="button"
            onClick={() =>
              directionMode === 'manual' ? void flipDirection('long') : undefined
            }
            disabled={directionMode === 'auto'}
            title={directionMode === 'auto' ? 'Auto mode active' : undefined}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
              omegaDirection === 'long'
                ? 'border-green-400 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-medium'
                : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }${directionMode === 'auto' ? ' opacity-40 cursor-not-allowed' : ''}`}
          >
            ↑ Long
          </button>
          <button
            type="button"
            onClick={() =>
              directionMode === 'manual' ? void flipDirection('short') : undefined
            }
            disabled={directionMode === 'auto'}
            title={directionMode === 'auto' ? 'Auto mode active' : undefined}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
              omegaDirection === 'short'
                ? 'border-red-400 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-medium'
                : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }${directionMode === 'auto' ? ' opacity-40 cursor-not-allowed' : ''}`}
          >
            ↓ Short
          </button>
        </div>
      </div>
    </div>
  );
}
