/**
 * AO dual-book fan-out helpers — fire Lane B venues concurrently so VT is not
 * queued behind OANDA. Trail / non-AO routes stay outside this helper.
 */

import { logError } from '../../utils/logger.js';
import { isOmegaLaneBBroker } from './alphaOmegaConstants.js';

export function partitionAoFanOutRoutes<T extends { brokerId: string }>(
  routes: T[],
): { aoRoutes: T[]; otherRoutes: T[] } {
  const aoRoutes: T[] = [];
  const otherRoutes: T[] = [];
  for (const route of routes) {
    if (isOmegaLaneBBroker(route.brokerId)) aoRoutes.push(route);
    else otherRoutes.push(route);
  }
  return { aoRoutes, otherRoutes };
}

/** Run independent per-broker tasks together; one rejection does not block others. */
export async function settleBrokerFanOutTasks(
  label: string,
  tasks: Array<() => Promise<void>>,
): Promise<void> {
  const settled = await Promise.allSettled(tasks.map((run) => run()));
  for (const result of settled) {
    if (result.status === 'rejected') {
      logError(`[AlphaOmega] ${label} route rejected — others kept`, {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }
}

/** Like settleBrokerFanOutTasks but preserves boolean "handled" from each task. */
export async function settleBrokerFanOutTasksWithFlags(
  label: string,
  tasks: Array<() => Promise<boolean>>,
): Promise<boolean> {
  const settled = await Promise.allSettled(tasks.map((run) => run()));
  let anyHandled = false;
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      anyHandled = anyHandled || result.value;
      continue;
    }
    logError(`[AlphaOmega] ${label} route rejected — others kept`, {
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  }
  return anyHandled;
}
