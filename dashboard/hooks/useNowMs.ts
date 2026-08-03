'use client';

import { useEffect, useState } from 'react';

/** Ticking wall-clock ms for relative age displays. */
export function useNowMs(intervalMs = 5_000): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const tickId = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(tickId);
  }, [intervalMs]);
  return nowMs;
}
