/** Environment-driven server configuration with sensible defaults */

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? fallback : parsed;
}

function envStr(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  /** Host to bind to (0.0.0.0 for production, localhost for dev) */
  host: envStr("HOST", "0.0.0.0"),

  /** WebSocket port */
  wsPort: envInt("WS_PORT", 3000),

  /** HTTP API port */
  httpPort: envInt("HTTP_PORT", 3001),

  /** Node environment */
  nodeEnv: envStr("NODE_ENV", "development"),

  /** Max WebSocket messages per connection per second */
  wsRateLimitPerSec: envInt("WS_RATE_LIMIT", 60),

  /** Max join attempts per connection per minute */
  joinRateLimitPerMin: envInt("JOIN_RATE_LIMIT", 5),

  /** Max HTTP requests per IP per minute for agent commands */
  httpCommandRateLimitPerMin: envInt("HTTP_COMMAND_RATE_LIMIT", 30),

  get isDev(): boolean {
    return this.nodeEnv === "development";
  },
};
