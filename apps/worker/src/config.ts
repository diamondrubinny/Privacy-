import { z } from 'zod';

const boolFromEnv = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SCANNER_CHROMIUM_EXECUTABLE_PATH: optionalString,
  SCANNER_BOT_INFO_URL: optionalString.pipe(z.url({ protocol: /^https?$/ }).optional()),
  SCANNER_NAV_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  SCANNER_SETTLE_MS: z.coerce.number().int().min(0).max(30_000).default(5_000),
  SCANNER_MAX_REQUESTS_PER_MODE: z.coerce.number().int().min(50).max(20_000).default(2_000),
  SCANNER_UPSTREAM_PROXY: optionalString.pipe(z.url({ protocol: /^http$/ }).optional()),
  SCANNER_UNSAFE_ALLOW_PRIVATE_NETWORKS: boolFromEnv,
  SCANNER_UNSAFE_IGNORE_HTTPS_ERRORS: boolFromEnv,
});

export type ScannerConfig = z.infer<typeof EnvSchema>;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Parses and validates scanner configuration. Unsafe switches are refused in production. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ScannerConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new ConfigError(`Invalid scanner configuration: ${fields}`);
  }
  const config = parsed.data;
  if (
    config.NODE_ENV === 'production' &&
    (config.SCANNER_UNSAFE_ALLOW_PRIVATE_NETWORKS || config.SCANNER_UNSAFE_IGNORE_HTTPS_ERRORS)
  ) {
    throw new ConfigError('SCANNER_UNSAFE_* options are not allowed when NODE_ENV=production');
  }
  return config;
}
