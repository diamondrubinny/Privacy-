import type { ScanResult } from '@privacyscan/shared';
import { TrackerMatcher } from '@privacyscan/tracker-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../apps/worker/src/config.js';
import { runScan } from '../../apps/worker/src/scan-job.js';
import {
  FIXTURE_DATASET,
  FIXTURE_HOSTS,
  startFixtureServer,
  type FixtureServer,
} from '../fixtures/server.js';

/**
 * End-to-end: real Chromium, real egress proxy, staged sites.
 * Set SCANNER_CHROMIUM_EXECUTABLE_PATH when Playwright's bundled browser is not installed.
 */

let fixtures: FixtureServer;
const results = new Map<string, ScanResult>();

const config = loadConfig({
  NODE_ENV: 'test',
  SCANNER_SETTLE_MS: '400',
  SCANNER_NAV_TIMEOUT_MS: '15000',
  SCANNER_CHROMIUM_EXECUTABLE_PATH: process.env.SCANNER_CHROMIUM_EXECUTABLE_PATH ?? '',
});

async function scan(host: string): Promise<ScanResult> {
  const cached = results.get(host);
  if (cached) return cached;
  const result = await runScan(
    {
      url: `http://${host}/`,
      modes: ['baseline', 'reject', 'accept'],
      overrides: {
        matcher: new TrackerMatcher(FIXTURE_DATASET),
        hostOverrides: new Map(
          FIXTURE_HOSTS.map((h) => [h, { host: '127.0.0.1', port: fixtures.port }]),
        ),
      },
    },
    config,
  );
  results.set(host, result);
  return result;
}

const ruleIds = (r: ScanResult): string[] => r.findings.map((f) => f.ruleId).sort();

beforeAll(async () => {
  fixtures = await startFixtureServer();
});

afterAll(async () => {
  await fixtures.close();
});

describe('bad.test', () => {
  it('reports every staged violation', async () => {
    const r = await scan('bad.test');
    expect(ruleIds(r)).toEqual([
      'CK-LONG-RETENTION',
      'CK-NO-REJECT',
      'CK-NO-REVISIT',
      'CK-PRECHECKED',
      'CK-PRECONSENT',
    ]);
    const pre = r.findings.find((f) => f.ruleId === 'CK-PRECONSENT');
    expect(pre?.title).toContain('Test Analytics');
    expect(pre?.severity).toBe('high');
    expect(r.findings.find((f) => f.ruleId === 'CK-PRECHECKED')?.evidence[0]?.summary).toContain(
      'שיווק',
    );
    expect(r.summary.cookies.risk).toBe('high');
  });

  it('detects the banner, and clicks accept but not a missing reject', async () => {
    const r = await scan('bad.test');
    expect(r.evidence.modes.baseline?.banner).toMatchObject({ found: true, cmp: 'generic' });
    expect(r.evidence.modes.reject?.action).toEqual({
      kind: 'reject',
      clicked: false,
      error: 'button-not-found',
    });
    expect(r.evidence.modes.accept?.action).toEqual({ kind: 'accept', clicked: true });
    const acceptHosts = r.evidence.modes.accept?.requests
      .filter((x) => x.phase === 'post-reload')
      .map((x) => x.hostname);
    expect(acceptHosts).toContain('ads.test');
  });

  it('blocks internal addresses requested by the page (SSRF) and never reaches them', async () => {
    const r = await scan('bad.test');
    const blocked = r.evidence.modes.baseline?.blockedRequests.map((b) => b.host) ?? [];
    expect(blocked).toEqual(expect.arrayContaining(['127.0.0.1', '169.254.169.254']));
    expect(fixtures.loopbackHits).toEqual([]);
  });

  it('minimizes stored data: no query values except the consent-mode flag', async () => {
    const r = await scan('bad.test');
    const collect = r.evidence.modes.baseline?.requests.find((x) => x.path === '/g/collect');
    expect(collect).toMatchObject({
      queryKeys: ['v', 'tid', 'gcs'],
      consentSignal: 'G111',
      thirdParty: true,
    });
    expect(JSON.stringify(r)).not.toContain('T-1');
    expect(JSON.stringify(r)).not.toContain('GA1.1.1');
  });
});

describe('ignore.test', () => {
  it('reports reject-ignored as critical', async () => {
    const r = await scan('ignore.test');
    expect(ruleIds(r)).toEqual(['CK-REJECT-IGNORED']);
    expect(r.findings[0]?.severity).toBe('critical');
    expect(r.findings[0]?.title).toContain('Test Ads');
  });
});

describe('good.test', () => {
  it('has no findings and an accurate inventory', async () => {
    const r = await scan('good.test');
    expect(r.findings).toEqual([]);
    expect(r.ruleErrors).toEqual([]);
    expect(r.inventory.trackers).toEqual([
      expect.objectContaining({
        vendor: 'Test Analytics',
        beforeConsent: false,
        seenIn: ['accept'],
      }),
    ]);
    expect(r.evidence.modes.reject?.action).toEqual({ kind: 'reject', clicked: true });
    expect(r.evidence.modes.baseline?.banner.revisitControlFound).toBe(true);
  });
});

describe('notice.test', () => {
  it('flags a notice-only banner with pre-consent tracking', async () => {
    const r = await scan('notice.test');
    // "Got it" dismisses the banner and leaves no way to revisit consent.
    expect(ruleIds(r)).toEqual(['CK-NO-REVISIT', 'CK-NOTICE-ONLY', 'CK-PRECONSENT']);
    expect(r.findings.find((f) => f.ruleId === 'CK-NOTICE-ONLY')?.severity).toBe('medium');
  });
});

describe('target validation', () => {
  it('refuses internal targets before launching a browser', async () => {
    await expect(
      runScan({ url: 'http://127.0.0.1/', modes: ['baseline'] }, config),
    ).rejects.toMatchObject({
      code: 'non-public-address',
    });
    await expect(
      runScan({ url: 'file:///etc/passwd', modes: ['baseline'] }, config),
    ).rejects.toMatchObject({
      code: 'unsupported-scheme',
    });
  });
});
