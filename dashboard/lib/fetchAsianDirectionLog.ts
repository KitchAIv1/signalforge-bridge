export interface AsianDirectionLogEntry {
  trade_date: string;
  triggered_at: string;
  amd_tag: string | null;
  prior_d1_direction: string | null;
  direction_set: string | null;
  previous_direction: string | null;
  direction_changed: boolean | null;
  action: string;
  reason: string;
  asian_session_result: string | null;
  created_at: string;
}

export async function fetchAsianDirectionLog(): Promise<AsianDirectionLogEntry[]> {
  const response = await fetch('/api/asian-direction-log', { cache: 'no-store' });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorPayload?.error ?? 'Failed to load Asian direction log');
  }

  return (await response.json()) as AsianDirectionLogEntry[];
}
