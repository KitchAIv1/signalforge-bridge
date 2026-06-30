/** Fade-prefixed structured logger. Delegates to src/utils/logger.ts. */

import { logDebug, logInfo, logWarn, logError } from '../../utils/logger.js';

const PREFIX = '[AudFade]';

export function fadeDebug(message: string, meta?: Record<string, unknown>): void {
  logDebug(`${PREFIX} ${message}`, meta);
}

export function fadeLog(message: string, meta?: Record<string, unknown>): void {
  logInfo(`${PREFIX} ${message}`, meta);
}

export function fadeWarn(message: string, meta?: Record<string, unknown>): void {
  logWarn(`${PREFIX} ${message}`, meta);
}

export function fadeError(message: string, meta?: Record<string, unknown>): void {
  logError(`${PREFIX} ${message}`, meta);
}
