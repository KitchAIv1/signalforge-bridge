import { logError, logInfo, logWarn } from '../../utils/logger.js';

export function peakFadeLog(message: string, meta?: Record<string, unknown>): void {
  logInfo(`[PeakFade] ${message}`, meta);
}

export function peakFadeWarn(message: string, meta?: Record<string, unknown>): void {
  logWarn(`[PeakFade] ${message}`, meta);
}

export function peakFadeError(message: string, meta?: Record<string, unknown>): void {
  logError(`[PeakFade] ${message}`, meta);
}
