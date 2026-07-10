'use client';

interface AlphaOmegaStepRailProps {
  filledSlots: number;
  totalSlots: number;
  overflow?: number;
  accent: 'sky' | 'amber' | 'rose';
  label?: string;
}

const ACCENT_FILL: Record<AlphaOmegaStepRailProps['accent'], string> = {
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
};

export function AlphaOmegaStepRail({
  filledSlots,
  totalSlots,
  overflow = 0,
  accent,
  label,
}: AlphaOmegaStepRailProps) {
  const slots = Array.from({ length: totalSlots }, (_, index) => index < filledSlots);
  return (
    <div>
      <div className="flex gap-1" aria-label={label ?? `Progress ${filledSlots} of ${totalSlots}`}>
        {slots.map((isFilled, index) => (
          <div
            key={index}
            className={`h-2.5 flex-1 rounded-sm transition-colors duration-300 ${
              isFilled ? ACCENT_FILL[accent] : 'bg-slate-200 dark:bg-slate-800'
            }`}
          />
        ))}
      </div>
      {overflow > 0 ? (
        <p className="mt-1 text-[11px] tabular-nums text-slate-500">
          +{overflow} past threshold (does not change arm rule)
        </p>
      ) : null}
    </div>
  );
}
