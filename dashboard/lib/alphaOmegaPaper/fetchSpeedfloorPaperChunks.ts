/** Chunked POST to speedfloor-paper API (avoids silent ID truncate). */

import type { SpeedfloorPaperOutcome } from './paperSimTypes';

const CHUNK = 40;

export async function fetchSpeedfloorPaperChunks(
  tradeIds: readonly string[],
): Promise<Record<string, SpeedfloorPaperOutcome>> {
  if (tradeIds.length === 0) return {};
  const merged: Record<string, SpeedfloorPaperOutcome> = {};
  for (let i = 0; i < tradeIds.length; i += CHUNK) {
    const chunk = tradeIds.slice(i, i + CHUNK);
    const res = await fetch('/api/alphaomega/speedfloor-paper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradeIds: chunk }),
    });
    const json = (await res.json()) as {
      outcomes?: Record<string, SpeedfloorPaperOutcome>;
      error?: string;
    };
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    Object.assign(merged, json.outcomes ?? {});
  }
  return merged;
}
