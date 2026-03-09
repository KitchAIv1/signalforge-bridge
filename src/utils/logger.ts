/** Structured logging with timestamps. */

const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[LOG_LEVEL as keyof typeof LEVELS] ?? 1;

function timestamp(): string {
  return new Date().toISOString();
}

function log(level: keyof typeof LEVELS, message: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < currentLevel) return;
  const line = meta ? `${timestamp()} [${level.toUpperCase()}] ${message} ${JSON.stringify(meta)}` : `${timestamp()} [${level.toUpperCase()}] ${message}`;
  if (level === 'error') console.error(line);
  else console.log(line);
}

export function logDebug(message: string, meta?: Record<string, unknown>): void {
  log('debug', message, meta);
}

export function logInfo(message: string, meta?: Record<string, unknown>): void {
  log('info', message, meta);
}

export function logWarn(message: string, meta?: Record<string, unknown>): void {
  log('warn', message, meta);
}

export function logError(message: string, meta?: Record<string, unknown>): void {
  log('error', message, meta);
}
