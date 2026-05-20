import type { ChangeEvent } from 'react';
import { amdTagLabel } from '@/lib/amdPanelFormatters';

const AMD_TAG_CODES = [
  'AMD_TEXTBOOK',
  'AMD_COMPRESSION_BREAKOUT',
  'AMD_FAILED',
  'AMD_SHIFTED',
  'AMD_NONE',
  'INSUFFICIENT_DATA',
] as const;

export { AMD_TAG_CODES };

interface ManualOverrideTagSelectProps {
  value: string;
  onTagSelect(change: ChangeEvent<HTMLSelectElement>): void;
}

export function ManualOverrideTagSelect({ value, onTagSelect }: ManualOverrideTagSelectProps) {
  return (
    <select
      value={value}
      onChange={onTagSelect}
      className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-800 dark:text-slate-100"
    >
      <option value="">Select correct tag…</option>
      {AMD_TAG_CODES.map((code) => (
        <option key={code} value={code}>
          {amdTagLabel(code)}
        </option>
      ))}
    </select>
  );
}
