interface ManualOverrideSaveButtonProps {
  disabled: boolean;
  saving: boolean;
  onSave(): void;
}

export function ManualOverrideSaveButton({ disabled, saving, onSave }: ManualOverrideSaveButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSave}
      className={`w-fit rounded border px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${
        disabled
          ? 'border-slate-200 dark:border-slate-600 text-slate-500'
          : 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 font-medium'
      }`}
    >
      {saving ? 'Saving…' : 'Save override'}
    </button>
  );
}
