import type { ReactNode } from 'react';

interface AmdIntelStatTileProps {
  caption: string;
  value: ReactNode;
  accentClassName?: string;
}

export function AmdIntelStatTile({ caption, value, accentClassName }: AmdIntelStatTileProps) {
  const valueTone =
    accentClassName != null && accentClassName !== ''
      ? accentClassName
      : 'text-slate-800 dark:text-slate-100';

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
      <p className="text-xs text-slate-400 mb-1">{caption}</p>
      <p className={`text-sm font-medium ${valueTone}`}>{value}</p>
    </div>
  );
}
