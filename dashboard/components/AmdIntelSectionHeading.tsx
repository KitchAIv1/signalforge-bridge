import { amdEvaluatedLabel } from '@/lib/amdPanelFormatters';

interface AmdIntelSectionHeadingProps {
  evaluatedAt: string | null;
}

export function AmdIntelSectionHeading({ evaluatedAt }: AmdIntelSectionHeadingProps) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        AMD Intelligence — AUD/USD
      </p>
      <span className="text-xs text-slate-400 dark:text-slate-500">{amdEvaluatedLabel(evaluatedAt)}</span>
    </div>
  );
}
