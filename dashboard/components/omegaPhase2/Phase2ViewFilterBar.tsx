'use client';

export type Phase2ViewFilter = 'all' | 'executed' | 'shadow' | 'blocked';

const FILTER_OPTIONS: Array<{ value: Phase2ViewFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'executed', label: 'Taken' },
  { value: 'shadow', label: 'Speed-floor shadow' },
  { value: 'blocked', label: 'Blocked' },
];

interface Phase2ViewFilterBarProps {
  activeFilter: Phase2ViewFilter;
  onFilterChange: (nextFilter: Phase2ViewFilter) => void;
}

export function Phase2ViewFilterBar({ activeFilter, onFilterChange }: Phase2ViewFilterBarProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTER_OPTIONS.map((option) => {
        const isActive = activeFilter === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onFilterChange(option.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? 'border-amber-500/60 bg-amber-500/15 text-amber-900 dark:text-amber-100'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
