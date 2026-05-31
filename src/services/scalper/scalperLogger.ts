/** Scalper-prefixed structured logger. Delegates to src/utils/logger.ts. */

import { logDebug, logInfo, logWarn, logError } from '../../utils/logger.js';

const PREFIX = '[Scalper]';

export function scalperDebug(message: string, meta?: Record<string, unknown>): void {
  logDebug(`${PREFIX} ${message}`, meta);
}

export function scalperLog(message: string, meta?: Record<string, unknown>): void {
  logInfo(`${PREFIX} ${message}`, meta);
}

export function scalperWarn(message: string, meta?: Record<string, unknown>): void {
  logWarn(`${PREFIX} ${message}`, meta);
}

export function scalperError(message: string, meta?: Record<string, unknown>): void {
  logError(`${PREFIX} ${message}`, meta);
}
