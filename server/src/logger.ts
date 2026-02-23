/** Structured logger with room/player correlation IDs */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  roomId?: string;
  playerId?: string;
  [key: string]: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let minLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function formatLog(level: LogLevel, msg: string, ctx?: LogContext): string {
  const ts = new Date().toISOString();
  const parts = [ts, level.toUpperCase().padEnd(5), msg];

  if (ctx) {
    const entries = Object.entries(ctx).filter(([, v]) => v !== undefined);
    if (entries.length > 0) {
      parts.push(
        entries.map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" ")
      );
    }
  }

  return parts.join(" | ");
}

export const log = {
  debug(msg: string, ctx?: LogContext): void {
    if (shouldLog("debug")) console.log(formatLog("debug", msg, ctx));
  },
  info(msg: string, ctx?: LogContext): void {
    if (shouldLog("info")) console.log(formatLog("info", msg, ctx));
  },
  warn(msg: string, ctx?: LogContext): void {
    if (shouldLog("warn")) console.warn(formatLog("warn", msg, ctx));
  },
  error(msg: string, ctx?: LogContext): void {
    if (shouldLog("error")) console.error(formatLog("error", msg, ctx));
  },
};
