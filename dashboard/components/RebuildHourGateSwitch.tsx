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
          ? 'border-amber-300 bg-amber-100 text-amber-950'
          : 'border-slate-200 bg-slate-100 text-slate-600'
      }`}
      title="Blocks ON = time restrictions active (bad UTC hours blocked). Blocks OFF = all hours open."
      aria-pressed={hourGateEnabled}
    >
      <span className="md:hidden">{hourGateEnabled ? 'B+' : 'B−'}</span>
      <span className="hidden md:inline">
        {hourGateEnabled ? '🕐 Blocks ON' : '🕐 Blocks OFF'}
      </span>
    </button>
  );
}
