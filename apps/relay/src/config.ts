export interface RelayConfig {
  host: string;
  port: number;
  signingKey: string;
  /**
   * When true the relay accepts connections without a valid signed ticket.
   * Enabled by default outside production so Phase 2 works before the
   * Phase 3 gateway exists. MUST be false in production (SEC-002).
   */
  devNoAuth: boolean;
  redisEnabled: boolean;
  redisUrl: string | undefined;
  logLevel: string;
}

const DEV_FALLBACK_KEY = 'orbit-dev-insecure-signing-key-change-me-32b';

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RelayConfig {
  const isProduction = env.NODE_ENV === 'production';
  const signingKey = env.JWT_SIGNING_KEY ?? DEV_FALLBACK_KEY;

  return {
    host: env.RELAY_HOST ?? '0.0.0.0',
    port: Number(env.PORT ?? env.RELAY_PORT ?? 1234),
    signingKey,
    devNoAuth: toBool(env.RELAY_DEV_NO_AUTH, !isProduction),
    redisEnabled: toBool(env.RELAY_REDIS_ENABLED, false),
    redisUrl: env.REDIS_URL,
    logLevel: env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  };
}
