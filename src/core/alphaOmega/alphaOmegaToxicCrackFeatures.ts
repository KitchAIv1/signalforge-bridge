/**
 * Pure toxic-crack predicates (shallow + refuse-tape).
 * Ported from scripts/aoRefuseTapeCf/refuseTapeFeatures.ts for live place gate.
 * No I/O — keep parity with research CF.
 */

export const TOXIC_CRACK_PRE_WINDOW_MS = 3 * 60 * 60 * 1000;
export const TOXIC_CRACK_NO_QUALIFYING = 'ALPHAOMEGA_NO_QUALIFYING_CRACK';

export interface ToxicCrackFireRow {
  createdAt: string;
  decision: string;
  blockReason: string | null;
  confluence: number | null;
}

export interface RefuseTapeContext {
  preFireCount: number;
  preBlockedCount: number;
  preNoCrackCount: number;
  preBlockRate: number;
  avgBlockedConf: number | null;
  refuseTape: boolean;
}

export interface ToxicCrackGeometry {
  foundingLength: number;
  foundingSpeedMin: number;
  confluence: number | null;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildRefuseTapeContext(
  fires: readonly ToxicCrackFireRow[],
  entryAt: string,
): RefuseTapeContext {
  const entryMs = Date.parse(entryAt);
  const windowStart = entryMs - TOXIC_CRACK_PRE_WINDOW_MS;
  const pre = fires.filter((fire) => {
    const fireMs = Date.parse(fire.createdAt);
    return fireMs >= windowStart && fireMs < entryMs;
  });
  const blocked = pre.filter((fire) => fire.decision === 'BLOCKED');
  const noCrack = blocked.filter((fire) => fire.blockReason === TOXIC_CRACK_NO_QUALIFYING);
  const blockedConfs = blocked
    .map((fire) => fire.confluence)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const preBlockRate = pre.length ? blocked.length / pre.length : 0;
  const refuseTape = pre.length >= 3 && preBlockRate >= 0.75 && noCrack.length >= 3;

  return {
    preFireCount: pre.length,
    preBlockedCount: blocked.length,
    preNoCrackCount: noCrack.length,
    preBlockRate: Math.round(preBlockRate * 1000) / 1000,
    avgBlockedConf: average(blockedConfs),
    refuseTape,
  };
}

export function isShallowCrack(geometry: ToxicCrackGeometry): boolean {
  return geometry.foundingLength === 7 && geometry.foundingSpeedMin <= 40;
}

export function isWeakCrackVsBlocked(
  geometry: ToxicCrackGeometry,
  context: RefuseTapeContext,
): boolean {
  if (geometry.confluence == null) return geometry.foundingLength === 7;
  if (context.avgBlockedConf == null) return geometry.confluence <= 18;
  return geometry.confluence <= Math.min(18, context.avgBlockedConf);
}

/** Intersection gate: shallow crack AND refuse tape AND weak conf. */
export function shouldSkipToxicCrack(
  geometry: ToxicCrackGeometry,
  context: RefuseTapeContext,
): boolean {
  return isShallowCrack(geometry) && context.refuseTape && isWeakCrackVsBlocked(geometry, context);
}

export function formatToxicCrackAdvisory(
  geometry: ToxicCrackGeometry,
  context: RefuseTapeContext,
  mode: 'block' | 'would_skip',
): string {
  const prefix =
    mode === 'block' ? 'ALPHAOMEGA_TOXIC_CRACK' : 'ALPHAOMEGA_TOXIC_CRACK_SHADOW';
  return (
    `${prefix}:len=${geometry.foundingLength}` +
    `:speed=${geometry.foundingSpeedMin.toFixed(1)}m` +
    `:refuse=${context.refuseTape ? 1 : 0}` +
    `:preBlock=${context.preBlockRate}` +
    `:noCrack=${context.preNoCrackCount}` +
    `:conf=${geometry.confluence ?? 'na'}`
  );
}
