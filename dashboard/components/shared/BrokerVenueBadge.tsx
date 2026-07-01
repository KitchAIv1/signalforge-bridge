'use client';

import { resolveBrokerVenueDisplay } from '@/lib/brokerVenueLabel';

interface BrokerVenueBadgeProps {
  brokerId: string | null | undefined;
}

export function BrokerVenueBadge({ brokerId }: BrokerVenueBadgeProps) {
  const venue = resolveBrokerVenueDisplay(brokerId);
  const badgeClasses =
    venue.kind === 'mt5'
      ? 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300'
      : 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300';

  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClasses}`}
      title={brokerId ?? 'oanda_practice'}
    >
      {venue.label}
    </span>
  );
}
