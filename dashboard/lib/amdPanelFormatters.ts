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
    AMD_PARTIAL: '⚠️ Partial AMD',
    AMD_DELAYED: '⏰ Delayed Distribution',
    AMD_SHIFTED: '➡️ Shifted / No AMD',
    AMD_NONE: '🚫 No Structure',
    INSUFFICIENT_DATA: '⏳ Insufficient Data',
  };
  return labels[tag] ?? tag;
}

export function amdTagColor(tag: string | null): string {
  if (!tag) return 'text-gray-400';
  const colors: Record<string, string> = {
    AMD_TEXTBOOK:             'text-green-400',
    AMD_COMPRESSION_BREAKOUT: 'text-blue-400',
    AMD_FAILED:               'text-red-400',
    AMD_PARTIAL:              'text-yellow-300',
    AMD_DELAYED:              'text-orange-400',
    AMD_SHIFTED:              'text-gray-300',
    AMD_NONE:                 'text-red-500',
    INSUFFICIENT_DATA:        'text-gray-500',
  };
  return colors[tag] ?? 'text-gray-400';
}

export function amdTagBgColor(tag: string | null): string {
  if (!tag) return 'bg-gray-800';
  const colors: Record<string, string> = {
    AMD_TEXTBOOK:             'bg-green-900/40 border border-green-700',
    AMD_COMPRESSION_BREAKOUT: 'bg-blue-900/40 border border-blue-700',
    AMD_FAILED:               'bg-red-900/40 border border-red-700',
    AMD_PARTIAL:              'bg-yellow-900/40 border border-yellow-700',
    AMD_DELAYED:              'bg-orange-900/40 border border-orange-700',
    AMD_SHIFTED:              'bg-gray-800 border border-gray-600',
    AMD_NONE:                 'bg-red-950/60 border border-red-800',
    INSUFFICIENT_DATA:        'bg-gray-900 border border-gray-700',
  };
  return colors[tag] ?? 'bg-gray-800';
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
    AMD_PARTIAL:              '1.0× (monitor)',
    AMD_DELAYED:              '1.0× (monitor)',
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
