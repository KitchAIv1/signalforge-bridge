/**
 * RegimeConfidenceBadge
 * Displays regime direction and confidence as a colored pill.
 * Used in the Activity table for each omega trade row.
 */

interface RegimeConfidenceBadgeProps {
  confidence:  string | null;
  direction:   string | null;
  evaluatedAt: string | null;
}

const badgeColorByConfidence: Record<string, string> = {
  HIGH:   'bg-green-100 text-green-800 border border-green-200',
  MEDIUM: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  LOW:    'bg-orange-100 text-orange-800 border border-orange-200',
  PAUSE:  'bg-gray-100 text-gray-500 border border-gray-200',
};

const directionArrow: Record<string, string> = {
  LONG:  '↑',
  SHORT: '↓',
  PAUSE: '—',
};

export function RegimeConfidenceBadge({
  confidence,
  direction,
  evaluatedAt,
}: RegimeConfidenceBadgeProps) {
  if (!confidence) {
    return <span className="text-gray-400 text-xs">—</span>;
  }

  const badgeClass = badgeColorByConfidence[confidence] ?? badgeColorByConfidence.PAUSE;
  const arrow      = directionArrow[direction ?? ''] ?? '—';
  const evalTime   = evaluatedAt
    ? new Date(evaluatedAt).toUTCString().slice(5, 22) + ' UTC'
    : '';

  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass}`}
        title={evalTime ? `Regime set at ${evalTime}` : 'No regime data'}
      >
        {arrow} {confidence}
      </span>
      {evalTime && (
        <span className="text-gray-400 text-xs leading-tight">{evalTime}</span>
      )}
    </div>
  );
}
