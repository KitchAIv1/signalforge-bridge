/**
 * Scale omega units for a specific broker route using that broker's equity.
 */

import { calculateUnits } from '../../core/positionSizer.js';
import type { EngineBrokerRoute } from './brokerLinkService.js';

export interface RouteUnitParams {
  baseUnits: number;
  baseEquity: number;
  route: EngineBrokerRoute;
  routeEquity: number;
  engineWeight: number;
}

export function scaleUnitsForBrokerRoute(params: RouteUnitParams): number {
  const { baseUnits, baseEquity, route, routeEquity, engineWeight } = params;
  if (baseEquity <= 0 || routeEquity <= 0) return baseUnits;
  const alloc = route.capitalAllocationPct > 0 ? route.capitalAllocationPct : 1;
  const scaled = Math.round(
    (baseUnits * routeEquity * engineWeight * alloc) / (baseEquity * engineWeight),
  );
  const sign = baseUnits < 0 ? -1 : 1;
  return sign * Math.max(1, Math.abs(scaled));
}

export function calculateRouteUnitsFromEquity(
  routeEquity: number,
  sizingParams: Parameters<typeof calculateUnits>[0],
  route: EngineBrokerRoute,
  engineWeight: number,
): number {
  const alloc = route.capitalAllocationPct > 0 ? route.capitalAllocationPct : 1;
  return calculateUnits({
    ...sizingParams,
    equity: routeEquity,
    engineWeight: engineWeight * alloc,
  });
}
