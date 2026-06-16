'use client';

import { OmegaLegTypeBadge } from '@/components/shared/OmegaLegTypeBadge';
import type { EnrichedLiveTrade } from '@/lib/overrideTradeLogEnrichment';

interface OverridePositionCardProps {
  trade: EnrichedLiveTrade;
  confirmClose: string | null;
  closing: string | null;
  onClose: (tradeId: string) => void;
}

function getDirection(units: string): 'LONG' | 'SHORT' {
  return parseFloat(units) > 0 ? 'LONG' : 'SHORT';
}

function getDurationMinutes(openTime: string): number {
  return Math.floor((Date.now() - new Date(openTime).getTime()) / 60000);
}

function getUnrealizedPips(trade: EnrichedLiveTrade): number {
  const pl = parseFloat(trade.unrealizedPL);
  const units = Math.abs(parseFloat(trade.units));
  if (units === 0) return 0;
  return parseFloat((pl / units / 0.0001).toFixed(1));
}

export function OverridePositionCard({
  trade,
  confirmClose,
  closing,
  onClose,
}: OverridePositionCardProps) {
  const direction = getDirection(trade.units);
  const pips = getUnrealizedPips(trade);
  const pl = parseFloat(trade.unrealizedPL);
  const duration = getDurationMinutes(trade.openTime);
  const isProfit = pl > 0;
  const isHighlight = Math.abs(pips) >= 6 && isProfit;

  return (
    <div
      className={`rounded-xl border p-4 ${
        isHighlight
          ? 'border-amber-500 bg-amber-950/30'
          : isProfit
            ? 'border-emerald-800 bg-emerald-950/20'
            : 'border-red-800 bg-red-950/20'
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-slate-100">{trade.instrument}</span>
          <span
            className={`ml-2 rounded px-1.5 py-0.5 text-xs font-medium ${
              direction === 'LONG'
                ? 'bg-emerald-900 text-emerald-300'
                : 'bg-red-900 text-red-300'
            }`}
          >
            {direction}
          </span>
          <OmegaLegTypeBadge legType={trade.legType} />
          {isHighlight && (
            <span className="ml-2 rounded bg-amber-800 px-1.5 py-0.5 text-xs font-medium text-amber-200">
              ⚡ {pips}p
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500">{duration}m</span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-slate-500">Entry</span>
          <div className="font-mono text-slate-200">{trade.price}</div>
        </div>
        <div>
          <span className="text-slate-500">Unrealized P&L</span>
          <div className={`font-mono font-semibold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
            {isProfit ? '+' : ''}
            {pips}p / ${pl.toFixed(2)}
          </div>
        </div>
        {trade.stopLossPrice && (
          <div>
            <span className="text-slate-500">SL</span>
            <div className="font-mono text-red-300">{trade.stopLossPrice}</div>
          </div>
        )}
        {trade.takeProfitPrice && (
          <div>
            <span className="text-slate-500">TP</span>
            <div className="font-mono text-emerald-300">{trade.takeProfitPrice}</div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onClose(trade.id)}
        disabled={closing === trade.id}
        className={`w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${
          confirmClose === trade.id
            ? 'bg-red-600 text-white hover:bg-red-500'
            : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
        } disabled:opacity-50`}
      >
        {closing === trade.id
          ? 'Closing...'
          : confirmClose === trade.id
            ? 'Tap again to confirm close'
            : 'Close Trade'}
      </button>
    </div>
  );
}
