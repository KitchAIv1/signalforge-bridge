'use client';

interface AmdAsianCloseFilterSwitchProps {
  filterEnabled: boolean;
  busy: boolean;
  onToggle: () => void;
}

export function AmdAsianCloseFilterSwitch({
  filterEnabled,
  busy,
  onToggle,
}: AmdAsianCloseFilterSwitchProps) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onToggle()}
      className={`inline-flex h-8 min-w-[2.5rem] shrink-0 cursor-pointer items-center justify-center border px-2 text-xs font-semibold max-md:min-h-[44px] md:min-w-[4.5rem] disabled:opacity-60 ${
        filterEnabled
          ? 'border-amber-300 bg-amber-100 text-amber-950'
          : 'border-slate-200 bg-slate-100 text-slate-600'
      }`}
      title="Asian filter ON = block when Asian close bias disagrees with auto_direction. OFF = all directions trade."
      aria-pressed={filterEnabled}
    >
      <span className="md:hidden">{filterEnabled ? 'A+' : 'A−'}</span>
      <span className="hidden md:inline">
        {filterEnabled ? '🌏 Filter ON' : '🌏 Filter OFF'}
      </span>
    </button>
  );
}
