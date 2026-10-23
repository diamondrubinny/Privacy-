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
  SCANNER_CRAWL_DELAY_MS: '0',
  // Fixture HTTPS uses a self-signed certificate.
  SCANNER_UNSAFE_IGNORE_HTTPS_ERRORS: 'true',
  SCANNER_CHROMIUM_EXECUTABLE_PATH: process.env.SCANNER_CHROMIUM_EXECUTABLE_PATH ?? '',
});

async function scan(host: string, scheme: 'http' | 'https' = 'http'): Promise<ScanResult> {
  const cached = results.get(`${scheme}://${host}`);
  if (cached) return cached;
  const result = await runScan(
    {
      url: `${scheme}://${host}/`,
      modes: ['baseline', 'reject', 'accept'],
      overrides: {
        matcher: new TrackerMatcher(FIXTURE_DATASET),
        hostOverrides: new Map(
          FIXTURE_HOSTS.map((h) => [
            h,
            { host: '127.0.0.1', port: fixtures.port, tlsPort: fixtures.tlsPort },
          ]),
        ),
      },
    },
    config,
  );
  results.set(`${scheme}://${host}`, result);
  return result;
}

/** Consent fixtures are single http pages; only their consent findings are under test here. */
const ruleIds = (r: ScanResult): string[] =>
  r.findings
    .map((f) => f.ruleId)
    .filter((id) => id.startsWith('CK-'))
    .sort();
const allIds = (r: ScanResult): string[] => [...new Set(r.findings.map((f) => f.ruleId))].sort();

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
    expect(ruleIds(r)).toEqual([]);
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

describe('secure.test (compliant, HTTPS)', () => {
  it('produces no findings at all', async () => {
    const r = await scan('secure.test', 'https');
    expect(r.findings.map((f) => `${f.ruleId}: ${f.title}`)).toEqual([]);
    expect(r.ruleErrors).toEqual([]);
  });

  it('crawled the legal and contact pages and read the policy', async () => {
    const r = await scan('secure.test', 'https');
    const audit = r.evidence.audit;
    expect(audit?.pages.map((p) => p.role).sort()).toEqual([
      'accessibility',
      'contact',
      'home',
      'privacy',
    ]);
    expect(audit?.policy?.text).toContain('אתר מאובטח בע"מ');
    expect(audit?.security?.httpRedirectsToHttps).toBe(true);
    expect(audit?.security?.tls?.protocol).toMatch(/^TLS/);
    const contact = audit?.pages.find((p) => p.role === 'contact');
    // Hidden reCAPTCHA textarea and honeypot are ignored.
    expect(contact?.forms[0]?.fields.map((f) => f.type)).toEqual(['text', 'email', 'textarea']);
    expect(contact?.a11y?.engine).toMatch(/^axe-core@/);
  });
});

describe('shop.test (staged violations, HTTPS)', () => {
  it('reports the expected rule set', async () => {
    const r = await scan('shop.test', 'https');
    expect(allIds(r)).toEqual([
      'A11Y-AXE-button-name',
      'A11Y-AXE-image-alt',
      'A11Y-OVERLAY-ONLY',
      'A11Y-STATEMENT-MISSING',
      'FORM-INSECURE-SUBMIT',
      'FORM-NO-NOTICE',
      'FORM-SENSITIVE-DATA',
      'FORM-THIRD-PARTY-ACTION',
      'POL-ELEMENTS-MISSING',
      'POL-OUTDATED',
      'SEC-COOKIE-FLAGS',
      'SEC-HEADERS',
      'SEC-HSTS',
      'SEC-MIXED-CONTENT',
      'SEC-NO-HTTPS',
      'SPAM-OPTIN-BUNDLED',
      'SPAM-OPTIN-PRECHECKED',
    ]);
  });

  it('reports each distinct form once, including the implicit (no <form>) join form', async () => {
    const r = await scan('shop.test', 'https');
    const noNotice = r.findings.filter((f) => f.ruleId === 'FORM-NO-NOTICE');
    // contact + join (implicit). The footer newsletter sits next to the footer's privacy link.
    expect(noNotice).toHaveLength(2);
    const sensitive = r.findings
      .filter((f) => f.ruleId === 'FORM-SENSITIVE-DATA')
      .map((f) => f.severity)
      .sort();
    expect(sensitive).toEqual(['high', 'medium']); // medical details; birth date
  });

  it('respects robots.txt for discovered pages', async () => {
    const r = await scan('shop.test', 'https');
    expect(r.evidence.audit?.robots).toEqual({
      status: 200,
      disallowedSkipped: ['https://shop.test/secret-offers'],
    });
    expect(fixtures.served.filter((s) => s.startsWith('shop.test/secret-offers'))).toEqual([]);
  });

  it('flags the missing HTTP→HTTPS redirect and the leaked version header', async () => {
    const r = await scan('shop.test', 'https');
    expect(r.findings.find((f) => f.ruleId === 'SEC-NO-HTTPS')?.severity).toBe('medium');
    expect(r.findings.find((f) => f.ruleId === 'SEC-HEADERS')?.description).toContain('PHP/7.4.3');
  });
});
