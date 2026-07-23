'use client';

import { MT5_SYMBOL_SUFFIX_OPTIONS } from '@/lib/mt5/mt5SymbolSuffix';

export interface Mt5SymbolSuffixFieldProps {
  value: string;
  onChange: (suffix: string) => void;
  disabled?: boolean;
  inferredSuffix?: string | null;
  hint?: string | null;
}

/** Reusable VT account-type suffix picker for any guided MT5 bind. */
export function Mt5SymbolSuffixField({
  value,
  onChange,
  disabled,
  inferredSuffix,
  hint,
}: Mt5SymbolSuffixFieldProps) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      Symbol suffix (account type)
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        {MT5_SYMBOL_SUFFIX_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {inferredSuffix ? (
        <span className="mt-1 block text-[11px] text-slate-500">
          MetaApi detected <span className="font-mono">{inferredSuffix}</span>
          {inferredSuffix !== value ? ' — override selected above' : ''}
        </span>
      ) : null}
      {hint ? <span className="mt-1 block text-[11px] text-slate-500">{hint}</span> : null}
    </label>
  );
}
