import { z } from 'zod';

const InstanceRole = z.enum(['leader', 'reader']);
const LogLevel = z.enum(['debug', 'info', 'warn', 'error']);

const envSchema = z.object({
  // spec.md §5.2 — Container Variables
  POLL_INTERVAL: z.coerce.number().int().positive().default(5),
  CACHE_TTL: z.coerce.number().int().positive().default(86400),
  TRUST_TTL: z.coerce.number().int().positive().default(3600),
  POLL_OBJECT_CACHING_RETRY_DAYS: z.coerce.number().int().positive().default(7),

  // Infrastructure
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  INSTANCE_ROLE: InstanceRole.default('leader'),

  // Server
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: LogLevel.default('info'),

  // VPR allowlist
  VPR_ALLOWLIST_PATH: z.string().default('config/vpr-allowlist.json'),
});

export type EnvConfig = z.infer<typeof envSchema>;
export type InstanceRoleType = z.infer<typeof InstanceRole>;

let _config: EnvConfig | null = null;

export function loadConfig(env: Record<string, string | undefined> = process.env): EnvConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${errors}`);
  }
  _config = result.data;
  return _config;
}

export function getConfig(): EnvConfig {
  if (_config === null) {
    throw new Error('Configuration not loaded. Call loadConfig() first.');
  }
  return _config;
}
