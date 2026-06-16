'use client';

import type { AmdState } from '@/lib/types';
import {
  asianShapeLabel,
  formatAsianTurnPosition,
  formatAsianTurnTimeUtc,
} from '@/lib/asianShapeFormatters';

interface AmdPanelAsianShapeFieldsProps {
  amdState: AmdState;
}

function ShadowPill() {
  return (
    <span className="ml-1 rounded px-1.5 py-0.5 text-xs font-semibold bg-yellow-900/20 text-yellow-500 dark:bg-yellow-900/30 dark:text-yellow-400">
      SHADOW
    </span>
  );
}

export function AmdPanelAsianShapeFields({ amdState }: AmdPanelAsianShapeFieldsProps) {
  if (amdState.asian_shape == null && amdState.asian_retracement_pct == null) {
    return null;
  }

  return (
    <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 dark:border-slate-600">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">
          Asian Shape
          <ShadowPill />
        </span>
        <span className="font-medium capitalize text-slate-700 dark:text-slate-200">
          {asianShapeLabel(amdState.asian_shape)}
        </span>
      </div>
      {amdState.asian_retracement_pct != null && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            Retracement %
            <ShadowPill />
          </span>
          <span>{amdState.asian_retracement_pct.toFixed(1)}%</span>
        </div>
      )}
      {(amdState.asian_turn_time != null || amdState.asian_turn_position != null) && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            Turn time + position
            <ShadowPill />
          </span>
          <span className="text-right text-xs sm:text-sm">
            {formatAsianTurnTimeUtc(amdState.asian_turn_time)}
            {' · '}
            {formatAsianTurnPosition(amdState.asian_turn_position)}
          </span>
        </div>
      )}
    </div>
  );
}
