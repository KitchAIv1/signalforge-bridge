'use client';

import type { AmdHistorySortColumn, AmdHistorySortState } from '@/lib/amdHistoryTableSort';

export type OutcomeFilterValue =
  | 'ALL'
  | 'AMD_TEXTBOOK'
  | 'AMD_COMPRESSION_BREAKOUT'
  | 'AMD_FAILED'
  | 'AMD_SHIFTED'
  | 'AMD_NONE'
  | 'PENDING';

export type AlignmentFilterValue = 'ALL' | 'ALIGNED' | 'CONFLICTED' | 'RANGING';
export type JudasFilterValue = 'ALL' | 'UP' | 'DOWN' | 'FLAT';

interface AmdHistoryTableFiltersProps {
  outcomeFilter: OutcomeFilterValue;
  onOutcomeFilterChange: (value: OutcomeFilterValue) => void;
  alignmentFilter: AlignmentFilterValue;
  onAlignmentFilterChange: (value: AlignmentFilterValue) => void;
  judasFilter: JudasFilterValue;
  onJudasFilterChange: (value: JudasFilterValue) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

const OUTCOME_OPTIONS: { value: OutcomeFilterValue; label: string }[] = [
  { value: 'ALL', label: 'All outcomes' },
  { value: 'AMD_TEXTBOOK', label: 'Textbook' },
  { value: 'AMD_COMPRESSION_BREAKOUT', label: 'Compression' },
  { value: 'AMD_FAILED', label: 'Failed' },
  { value: 'AMD_SHIFTED', label: 'Shifted' },
  { value: 'AMD_NONE', label: 'None' },
  { value: 'PENDING', label: 'Pending' },
];

const ALIGNMENT_OPTIONS: { value: AlignmentFilterValue; label: string }[] = [
  { value: 'ALL', label: 'All alignment' },
  { value: 'ALIGNED', label: 'Aligned' },
  { value: 'CONFLICTED', label: 'Conflicted' },
  { value: 'RANGING', label: 'Ranging' },
];

const JUDAS_OPTIONS: { value: JudasFilterValue; label: string }[] = [
  { value: 'ALL', label: 'All Judas' },
  { value: 'UP', label: 'UP' },
  { value: 'DOWN', label: 'DOWN' },
  { value: 'FLAT', label: 'FLAT' },
];

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-500">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AmdHistoryTableFilters({
  outcomeFilter,
  onOutcomeFilterChange,
  alignmentFilter,
  onAlignmentFilterChange,
  judasFilter,
  onJudasFilterChange,
  onClearFilters,
  hasActiveFilters,
}: AmdHistoryTableFiltersProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Outcome"
          value={outcomeFilter}
          options={OUTCOME_OPTIONS}
          onChange={onOutcomeFilterChange}
        />
        <FilterSelect
          label="Alignment"
          value={alignmentFilter}
          options={ALIGNMENT_OPTIONS}
          onChange={onAlignmentFilterChange}
        />
        <FilterSelect
          label="Judas"
          value={judasFilter}
          options={JUDAS_OPTIONS}
          onChange={onJudasFilterChange}
        />
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-xs text-blue-500 hover:text-blue-400"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type { AmdHistorySortColumn, AmdHistorySortState };
