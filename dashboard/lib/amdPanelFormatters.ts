/**
 * Pure helpers for AMD panel and activity table AMD column.
 * No Supabase / React imports.
 */
/**
 * amdPanelFormatters — pure helpers for AMD UI copy.
 */

export function amdTagLabel(tag: string | null): string {
  if (!tag) return 'Not computed';
  const labels: Record<string, string> = {
    AMD_TEXTBOOK: '📚 Textbook AMD',
    AMD_COMPRESSION_BREAKOUT: '🚀 Compression Breakout',
    AMD_FAILED: '❌ AMD Failed',
    AMD_SHIFTED: '➡️ Shifted / No AMD',
    AMD_NONE: '🚫 No Structure',
    INSUFFICIENT_DATA: '⏳ Insufficient Data',
  };
  return labels[tag] ?? tag;
}

/** Activity table / inline cells — light + dark foreground pairs */
export function amdTagColor(tag: string | null): string {
  if (!tag) return 'text-slate-500 dark:text-slate-400';
  const colors: Record<string, string> = {
    AMD_TEXTBOOK:             'text-green-700 dark:text-green-400',
    AMD_COMPRESSION_BREAKOUT: 'text-blue-700 dark:text-blue-300',
    AMD_FAILED:               'text-red-600 dark:text-red-400',
    AMD_SHIFTED:              'text-slate-700 dark:text-slate-300',
    AMD_NONE:                 'text-red-700 dark:text-red-400',
    INSUFFICIENT_DATA:        'text-slate-600 dark:text-slate-400',
  };
  return colors[tag] ?? 'text-slate-500 dark:text-slate-400';
}

/** Primary AMD badge chip — tuned for tinted badge backgrounds */
export function amdTagBadgeTextClass(tag: string | null): string {
  if (!tag) return 'text-slate-50 dark:text-slate-100';
  const colors: Record<string, string> = {
    AMD_TEXTBOOK:             'text-green-50 dark:text-green-100',
    AMD_COMPRESSION_BREAKOUT: 'text-blue-50 dark:text-blue-100',
    AMD_FAILED:               'text-red-50 dark:text-red-100',
    AMD_SHIFTED:              'text-slate-50 dark:text-slate-100',
    AMD_NONE:                 'text-red-100 dark:text-red-50',
    INSUFFICIENT_DATA:        'text-slate-200 dark:text-slate-100',
  };
  return colors[tag] ?? 'text-slate-50 dark:text-slate-100';
}

export function amdTagBgColor(tag: string | null): string {
  if (!tag) {
    return 'bg-slate-800 border border-slate-600 dark:bg-slate-900/90 dark:border-slate-500';
  }
  const colors: Record<string, string> = {
    AMD_TEXTBOOK:             'bg-green-900/40 border border-green-700 dark:border-green-600',
    AMD_COMPRESSION_BREAKOUT: 'bg-blue-900/40 border border-blue-700 dark:border-blue-600',
    AMD_FAILED:               'bg-red-900/40 border border-red-700 dark:border-red-600',
    AMD_SHIFTED:              'bg-slate-800/85 border border-slate-600 dark:bg-slate-900/80 dark:border-slate-500',
    AMD_NONE:                 'bg-red-950/60 border border-red-800 dark:border-red-700',
    INSUFFICIENT_DATA:
      'bg-slate-900/90 border border-slate-700 dark:bg-slate-950/85 dark:border-slate-600',
  };
  return (
    colors[tag] ??
    'bg-slate-800 border border-slate-600 dark:bg-slate-900/90 dark:border-slate-500'
  );
}

export function judasDirectionLabel(dir: string | null): string {
  if (!dir) return '—';
  if (dir === 'DOWN') return '↓ DOWN (Fake short, real LONG)';
  if (dir === 'UP') return '↑ UP (Fake long, real SHORT)';
  return 'FLAT';
}

export function amdSizeMultiplierLabel(tag: string | null): string {
  if (!tag) return '1.0× (no data)';
  const multipliers: Record<string, string> = {
    AMD_TEXTBOOK:             '2.5× when aligned',
    AMD_COMPRESSION_BREAKOUT: '1.5× when aligned',
    AMD_FAILED:               '0.25× (danger)',
    AMD_SHIFTED:              '1.0× (macro governs)',
    AMD_NONE:                 '0.5× (no structure)',
    INSUFFICIENT_DATA:        '1.0× (pending)',
  };
  return multipliers[tag] ?? '1.0×';
}

export function amdEvaluatedLabel(evaluatedAt: string | null): string {
  if (!evaluatedAt) return 'Not evaluated today';
  const d = new Date(evaluatedAt);
  const hours = d.getUTCHours().toString().padStart(2, '0');
  const mins = d.getUTCMinutes().toString().padStart(2, '0');
  return `Evaluated at ${hours}:${mins} UTC`;
}

/**
 * Returns actual computed size multiplier as display string.
 * Uses numeric value from amd_state when available.
 * Falls back to tag-based estimate when null.
 */
export function amdSizeMultiplierDisplay(
  numericValue: number | null | undefined,
  tag: string | null,
): string {
  if (numericValue != null) {
    return `${numericValue.toFixed(2)}×`;
  }
  return amdSizeMultiplierLabel(tag);
}

export function autoDirectionLabel(dir: string | null | undefined): string {
  if (!dir) return '—';
  if (dir === 'neutral') return '⚪ NEUTRAL';
  if (dir === 'long') return '↑ LONG';
  if (dir === 'short') return '↓ SHORT';
  return dir.toUpperCase();
}

export function autoDirectionColor(dir: string | null | undefined): string {
  if (dir === 'long') return 'text-emerald-600 dark:text-emerald-400';
  if (dir === 'short') return 'text-red-600 dark:text-red-400';
  return 'text-slate-500 dark:text-slate-400';
}

export function autoDirectionConfidenceLabel(
  confidence: string | null | undefined,
): string {
  if (!confidence) return '—';
  const labels: Record<string, string> = {
    high: '🟢 High',
    medium: '🟡 Medium',
    low: '🟠 Low',
    very_low: '🔴 Very Low',
  };
  return labels[confidence] ?? confidence;
}

export function m5SignalLabel(
  signal: string | null | undefined,
): string {
  if (!signal) return '—';
  const labels: Record<string, string> = {
    WITH_JUDAS: '▶ With Judas',
    AGAINST_JUDAS: '◀ Against Judas',
    NEUTRAL: '◉ Neutral',
  };
  return labels[signal] ?? signal;
}

export function m5SignalColor(
  signal: string | null | undefined,
): string {
  if (signal === 'WITH_JUDAS')
    return 'text-blue-600 dark:text-blue-400';
  if (signal === 'AGAINST_JUDAS')
    return 'text-orange-600 dark:text-orange-400';
  return 'text-slate-500 dark:text-slate-400';
}

export function outcomeTagLabel(
  tag: string | null | undefined,
): string {
  if (!tag) return '—';
  const labels: Record<string, string> = {
    AMD_TEXTBOOK: '📚 Textbook',
    AMD_COMPRESSION_BREAKOUT: '🚀 Compression',
    AMD_FAILED: '❌ Failed',
    AMD_SHIFTED: '➡️ Shifted',
    AMD_NONE: '🚫 None',
    INSUFFICIENT_DATA: '⏳ Insufficient',
  };
  return labels[tag] ?? tag;
}

export function outcomeTagColor(
  tag: string | null | undefined,
): string {
  if (tag === 'AMD_TEXTBOOK')
    return 'text-green-600 dark:text-green-400';
  if (tag === 'AMD_COMPRESSION_BREAKOUT')
    return 'text-blue-600 dark:text-blue-400';
  if (tag === 'AMD_FAILED')
    return 'text-red-600 dark:text-red-400';
  return 'text-slate-500 dark:text-slate-400';
}
