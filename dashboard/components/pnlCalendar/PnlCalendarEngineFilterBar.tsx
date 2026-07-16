'use client';

import { ENGINE_COLORS } from '@/lib/pnlCalendarConstants';
import {
  PNL_CALENDAR_FILTER_OPTIONS,
  type PnlCalendarFilterKey,
} from '@/lib/pnlCalendarEngineFilter';

interface PnlCalendarEngineFilterBarProps {
  selectedKeys: readonly PnlCalendarFilterKey[];
  onToggleKey: (key: PnlCalendarFilterKey) => void;
}

export function PnlCalendarEngineFilterBar({
  selectedKeys,
  onToggleKey,
}: PnlCalendarEngineFilterBarProps) {
  const selected = new Set(selectedKeys);
  return (
    <div className="mb-5">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Engines
      </p>
      <div className="flex flex-wrap gap-1.5">
        {PNL_CALENDAR_FILTER_OPTIONS.map((option) => {
          const active = selected.has(option.key);
          const color = ENGINE_COLORS[option.colorKey] ?? '#64748b';
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onToggleKey(option.key)}
              aria-pressed={active}
              className="rounded px-2.5 py-1 text-[11px] font-semibold transition-opacity"
              style={{
                color: active ? color : '#64748b',
                background: active ? `${color}22` : 'transparent',
                border: `1px solid ${active ? `${color}66` : '#1e2d3d'}`,
                opacity: active ? 1 : 0.55,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {selectedKeys.length === 0 ? (
        <p className="mt-2 text-[11px] text-amber-500">
          No engines selected — calendar is empty. Toggle at least one engine.
        </p>
      ) : null}
    </div>
  );
}
