export interface TimelineEntry {
  atMs: number;
  direction: 'long' | 'short';
  kind: 'fill' | 'block';
  pnlPips: number | null;
}

export interface AmdAsianSlice {
  asianIsFlat: boolean | null;
  accumulationQuality: number | null;
  asianNetPips: number | null;
  asianRangePips: number | null;
}

export interface DayFlags {
  tradeDate: string;
  executionBleed: boolean;
  flipStormRaw: boolean;
  flipStormAfterSl: boolean;
  dayCautionAmd: boolean;
  dayCautionStrict: boolean;
  flagCount: number;
  twoPlusFlags: boolean;
  flipStormAtMs: number | null;
  bleedBefore10Pips: number;
  bleedSlBefore10: number;
}

function normDir(raw: string): 'long' | 'short' | null {
  const d = raw.toLowerCase();
  if (d === 'long' || d === 'short') return d;
  return null;
}

function isBefore10Utc(ms: number): boolean {
  return new Date(ms).getUTCHours() < 10;
}

function isDistWindow(ms: number): boolean {
  const d = new Date(ms);
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return mins >= 10 * 60 + 31 && mins < 16 * 60;
}

export function buildTimeline(
  fills: TimelineEntry[],
  blocks: TimelineEntry[],
): TimelineEntry[] {
  const seen = new Set<string>();
  const merged = [...fills, ...blocks].sort((a, b) => a.atMs - b.atMs);
  const out: TimelineEntry[] = [];
  for (const row of merged) {
    const key = `${row.atMs}-${row.direction}-${row.kind}`;
    const minuteKey = `${new Date(row.atMs).toISOString().slice(0, 16)}|${row.direction}|${row.kind}`;
    if (seen.has(minuteKey)) continue;
    seen.add(minuteKey);
    out.push(row);
  }
  return out;
}

function maxDirectionChangesIn90m(timeline: TimelineEntry[]): number {
  if (timeline.length < 2) return 0;
  let best = 0;
  for (let i = 0; i < timeline.length; i++) {
    const start = timeline[i]!.atMs;
    const window = timeline.filter((e) => e.atMs >= start && e.atMs <= start + 90 * 60_000);
    let changes = 0;
    for (let j = 1; j < window.length; j++) {
      if (window[j]!.direction !== window[j - 1]!.direction) changes += 1;
    }
    if (changes > best) best = changes;
  }
  return best;
}

export function detectFlipStorm(timeline: TimelineEntry[], minChanges = 2): boolean {
  return maxDirectionChangesIn90m(timeline) >= minChanges;
}

function firstFlipStormMs(timeline: TimelineEntry[], minChanges: number): number | null {
  for (let i = 0; i < timeline.length; i++) {
    const start = timeline[i]!.atMs;
    const window = timeline.filter((e) => e.atMs >= start && e.atMs <= start + 90 * 60_000);
    let changes = 0;
    for (let j = 1; j < window.length; j++) {
      if (window[j]!.direction !== window[j - 1]!.direction) changes += 1;
    }
    if (changes >= minChanges) return start;
  }
  return null;
}

function hadSlLikeFillBefore(ms: number, fills: TimelineEntry[]): boolean {
  return fills.some(
    (f) =>
      f.atMs <= ms &&
      f.kind === 'fill' &&
      f.pnlPips != null &&
      (f.pnlPips <= -9 || (f.pnlPips < 3 && f.pnlPips < 0)),
  );
}

export function computeDayCaution(amd: AmdAsianSlice | null): {
  amd: boolean;
  strict: boolean;
} {
  if (!amd) return { amd: false, strict: false };
  const dirRatio =
    amd.asianRangePips != null && amd.asianRangePips > 0 && amd.asianNetPips != null
      ? Math.abs(amd.asianNetPips) / amd.asianRangePips
      : null;
  const amdLoose =
    amd.asianIsFlat === true ||
    (amd.accumulationQuality != null && amd.accumulationQuality >= 0.7) ||
    (dirRatio != null && dirRatio < 0.25);
  const amdStrict =
    amd.asianIsFlat === true &&
    (amd.accumulationQuality != null && amd.accumulationQuality >= 0.7);
  return { amd: amdLoose, strict: amdStrict };
}

export function computeDayFlags(
  tradeDate: string,
  bleedFills: TimelineEntry[],
  blocks: TimelineEntry[],
  amd: AmdAsianSlice | null,
  timelineFills?: TimelineEntry[],
): DayFlags {
  const fillsBefore10 = bleedFills.filter((f) => f.kind === 'fill' && isBefore10Utc(f.atMs));
  const bleedPips = fillsBefore10.reduce((s, f) => s + (f.pnlPips ?? 0), 0);
  const bleedSl = fillsBefore10.filter(
    (f) => f.pnlPips != null && (f.pnlPips <= -9 || f.pnlPips <= -7),
  ).length;
  const executionBleed = bleedSl >= 2 || bleedPips <= -15;

  const flipFills = timelineFills ?? bleedFills;
  const timeline = buildTimeline(flipFills, blocks);
  const flipStormRaw = detectFlipStorm(timeline, 2);
  const flipStormAfterSl =
    flipStormRaw &&
    timeline.some(
      (e) => e.kind === 'block' && hadSlLikeFillBefore(e.atMs, bleedFills),
    );
  const flipStormAtMs = firstFlipStormMs(timeline, 2);

  const caution = computeDayCaution(amd);
  const flags = [
    executionBleed,
    flipStormAfterSl || flipStormRaw,
    caution.amd,
  ];
  const flagCount = flags.filter(Boolean).length;

  return {
    tradeDate,
    executionBleed,
    flipStormRaw,
    flipStormAfterSl,
    dayCautionAmd: caution.amd,
    dayCautionStrict: caution.strict,
    flagCount,
    twoPlusFlags: flagCount >= 2,
    flipStormAtMs,
    bleedBefore10Pips: Math.round(bleedPips * 10) / 10,
    bleedSlBefore10: bleedSl,
  };
}

export function isDistSignal(atMs: number): boolean {
  return isDistWindow(atMs);
}
