'use client';

export type Phase2BookScope = 'live' | 'shadow';

interface Phase2BookScopeBarProps {
  activeScope: Phase2BookScope;
  onScopeChange: (scope: Phase2BookScope) => void;
}

const SCOPES: Array<{ id: Phase2BookScope; label: string }> = [
  { id: 'live', label: 'Live AO' },
  { id: 'shadow', label: 'Shadow AO' },
];

export function Phase2BookScopeBar({
  activeScope,
  onScopeChange,
}: Phase2BookScopeBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Book
      </span>
      {SCOPES.map((scope) => {
        const active = scope.id === activeScope;
        return (
          <button
            key={scope.id}
            type="button"
            onClick={() => onScopeChange(scope.id)}
            className={
              active
                ? 'rounded border border-violet-500 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800 dark:border-violet-400 dark:bg-violet-950 dark:text-violet-100'
                : 'rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300'
            }
          >
            {scope.label}
          </button>
        );
      })}
      {activeScope === 'shadow' && (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Paper book — matched + &gt;7.7 centroid fires · no broker orders
        </span>
      )}
    </div>
  );
}
