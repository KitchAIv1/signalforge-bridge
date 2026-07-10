'use client';

import { AccountSnapshotDisplay } from '@/components/AccountSnapshotDisplay';
import { useAccountSnapshot } from '@/hooks/useAccountSnapshot';

/** Activity / default: Lane A snapshot from bridge_health_log. */
export function AccountSnapshotBar() {
  const { snapshot, isStale } = useAccountSnapshot();
  return <AccountSnapshotDisplay snapshot={snapshot} isStale={isStale} />;
}
