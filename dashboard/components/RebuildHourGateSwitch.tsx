'use client';

interface RebuildHourGateSwitchProps {
  hourGateEnabled: boolean;
  busy: boolean;
  onToggle: () => void;
}

export function RebuildHourGateSwitch({
  hourGateEnabled,
  busy,
  onToggle,
}: RebuildHourGateSwitchProps) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onToggle()}
      className={`inline-flex h-8 min-w-[2.5rem] shrink-0 cursor-pointer items-center justify-center border px-2 text-xs font-semibold max-md:min-h-[44px] md:min-w-[4.5rem] disabled:opacity-60 ${
        hourGateEnabled
          ? 'border-sky-300 bg-sky-100 text-sky-900'
          : 'border-amber-300 bg-amber-100 text-amber-950'
      }`}
      title="Live bridge only: when ON, blocks Rebuild in bad UTC hours; medium-R gate unchanged"
      aria-pressed={hourGateEnabled}
    >
      <span className="md:hidden">{hourGateEnabled ? 'H+' : 'H−'}</span>
      <span className="hidden md:inline">
        {hourGateEnabled ? '🕐 Hours ON' : '🕐 Hours OFF'}
      </span>
    </button>
  );
}
