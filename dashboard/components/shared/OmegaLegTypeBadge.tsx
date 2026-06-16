interface OmegaLegTypeBadgeProps {
  legType: string | null | undefined;
}

function legBadgeLabel(legType: string): string {
  if (legType === 'tp1') return 'T1';
  if (legType === 'tp2') return 'T2';
  return 'T3';
}

function legBadgeClasses(legType: string): string {
  if (legType === 'tp1') {
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
  }
  if (legType === 'tp2') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300';
  }
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
}

export function OmegaLegTypeBadge({ legType }: OmegaLegTypeBadgeProps) {
  if (!legType) return null;

  return (
    <span
      className={`ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold ${legBadgeClasses(legType)}`}
    >
      {legBadgeLabel(legType)}
    </span>
  );
}
