import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    const c = loadConfig({});
    expect(c.SCANNER_UNSAFE_ALLOW_PRIVATE_NETWORKS).toBe(false);
    expect(c.SCANNER_SETTLE_MS).toBe(5_000);
    expect(c.SCANNER_UPSTREAM_PROXY).toBeUndefined();
  });

  it('treats empty strings as unset', () => {
    const c = loadConfig({ SCANNER_CHROMIUM_EXECUTABLE_PATH: '', SCANNER_UPSTREAM_PROXY: ' ' });
    expect(c.SCANNER_CHROMIUM_EXECUTABLE_PATH).toBeUndefined();
    expect(c.SCANNER_UPSTREAM_PROXY).toBeUndefined();
  });

  it('refuses unsafe switches in production', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', SCANNER_UNSAFE_ALLOW_PRIVATE_NETWORKS: 'true' }),
    ).toThrow(ConfigError);
    expect(() =>
      loadConfig({ NODE_ENV: 'production', SCANNER_UNSAFE_IGNORE_HTTPS_ERRORS: '1' }),
    ).toThrow(ConfigError);
  });

  it('names invalid fields without echoing values', () => {
    try {
      loadConfig({ SCANNER_UPSTREAM_PROXY: 'ftp://user:secret@host' });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toContain('SCANNER_UPSTREAM_PROXY');
      expect((e as Error).message).not.toContain('secret');
    }
  });
});
