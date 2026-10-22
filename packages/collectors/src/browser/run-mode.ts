import type {
  BrowserMode,
  CookieRecord,
  ModeEvidence,
  ObservationPhase,
  RequestRecord,
} from '@privacyscan/shared';
import type { TrackerMatcher, TrackerMatchDetail } from '@privacyscan/tracker-db';
import type { Browser, BrowserContext, Cookie, Page, Request } from 'playwright-core';
import { join } from 'node:path';
import { getDomain } from 'tldts';
import { clickConsent, detectBanner, detectRevisitControl } from './banner.js';

export interface ModeOptions {
  targetUrl: string;
  siteDomain: string;
  navTimeoutMs: number;
  settleMs: number;
  maxRequests: number;
  userAgent: string;
  locale: string;
  timezoneId: string;
  viewport: { width: number; height: number };
  ignoreHttpsErrors: boolean;
  matcher: TrackerMatcher;
  /** Shared sink filled by the egress proxy while this mode runs. */
  blockedSink: { host: string; reason: string }[];
  /** Local troubleshooting only: screenshots may contain personal data shown on the site. */
  screenshotDir?: string;
}

const MAX_PATH_LENGTH = 200;
const MAX_QUERY_KEYS = 50;
const CLICK_TIMEOUT_MS = 5_000;
const GCS_PATTERN = /^G1[01-]{2}$/;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function registrableDomain(hostname: string): string {
  const host = hostname.replace(/^\./, '').toLowerCase();
  return getDomain(host) ?? host;
}

function trackerOf(match: TrackerMatchDetail | undefined): RequestRecord['tracker'] {
  if (!match) return undefined;
  return {
    vendor: match.vendor,
    category: match.category,
    entryId: match.entryId,
    ...(match.lowRisk ? { lowRisk: true } : {}),
  };
}

/** Builds a minimized request record: no query values except the Consent Mode flag. */
export function toRequestRecord(
  rawUrl: string,
  meta: { resourceType: string; method: string },
  phase: ObservationPhase,
  siteDomain: string,
  matcher: TrackerMatcher,
): RequestRecord | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const tracker = trackerOf(matcher.matchRequest(url.hostname, url.pathname));
  const gcs = url.searchParams.get('gcs');
  return {
    origin: url.origin,
    path: url.pathname.slice(0, MAX_PATH_LENGTH),
    queryKeys: [...new Set(url.searchParams.keys())].slice(0, MAX_QUERY_KEYS),
    resourceType: meta.resourceType,
    method: meta.method,
    hostname: url.hostname,
    thirdParty: registrableDomain(url.hostname) !== siteDomain,
    phase,
    ...(tracker ? { tracker } : {}),
    ...(gcs && GCS_PATTERN.test(gcs) ? { consentSignal: gcs } : {}),
  };
}

function cookieKey(c: Pick<Cookie, 'name' | 'domain' | 'path'>): string {
  return `${c.name}|${c.domain}|${c.path}`;
}

/** cookieKey → expires; a changed expiry means the cookie was (re)written in between. */
type CookieSnapshot = Map<string, number>;

/**
 * Attributes a cookie to the latest phase in which it was created or rewritten.
 * Rewrites of session cookies (no expiry) are not detectable and keep the earlier phase.
 */
export function cookiePhase(
  cookie: Pick<Cookie, 'name' | 'domain' | 'path' | 'expires'>,
  preAction: CookieSnapshot | undefined,
  preReload: CookieSnapshot | undefined,
): ObservationPhase {
  if (!preAction) return 'pre-action';
  const key = cookieKey(cookie);
  if (preReload && preReload.get(key) !== cookie.expires) return 'post-reload';
  return preAction.get(key) === cookie.expires ? 'pre-action' : 'post-action';
}

async function screenshot(page: Page, dir: string | undefined, name: string): Promise<void> {
  if (!dir) return;
  await page.screenshot({ path: join(dir, name), timeout: 10_000 }).catch(() => undefined);
}

export function toCookieRecord(
  cookie: Cookie,
  phase: ObservationPhase,
  siteDomain: string,
  matcher: TrackerMatcher,
): CookieRecord {
  const tracker = trackerOf(matcher.matchCookie(cookie.name));
  return {
    name: cookie.name.slice(0, 200),
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    thirdParty: registrableDomain(cookie.domain) !== siteDomain,
    phase,
    ...(tracker ? { tracker } : {}),
  };
}

async function navigate(page: Page, url: string, timeout: number): Promise<string | undefined> {
  try {
    await page.goto(url, { waitUntil: 'load', timeout });
    return undefined;
  } catch (error) {
    // A slow "load" event is common on ad-heavy sites; keep whatever rendered.
    if (error instanceof Error && error.name === 'TimeoutError') return 'navigation-timeout';
    return 'navigation-failed';
  }
}

async function storageKeys(page: Page): Promise<ModeEvidence['storageKeys']> {
  try {
    return await page.evaluate<ModeEvidence['storageKeys']>(
      '({ local: Object.keys(localStorage).slice(0, 200), session: Object.keys(sessionStorage).slice(0, 200) })',
    );
  } catch {
    return { local: [], session: [] };
  }
}

async function newContext(browser: Browser, opts: ModeOptions): Promise<BrowserContext> {
  return browser.newContext({
    userAgent: opts.userAgent,
    locale: opts.locale,
    timezoneId: opts.timezoneId,
    viewport: opts.viewport,
    serviceWorkers: 'block',
    acceptDownloads: false,
    ignoreHTTPSErrors: opts.ignoreHttpsErrors,
  });
}

/**
 * Runs one isolated browser session:
 * - baseline: load and observe, no interaction
 * - reject/accept: load, click the consent button, observe, reload, observe
 */
export async function runMode(
  browser: Browser,
  mode: BrowserMode,
  opts: ModeOptions,
): Promise<ModeEvidence> {
  const context = await newContext(browser, opts);
  const requests: RequestRecord[] = [];
  const byRequest = new WeakMap<Request, RequestRecord>();
  let phase: ObservationPhase = 'pre-action';
  let truncated = false;

  context.on('request', (req) => {
    if (requests.length >= opts.maxRequests) {
      truncated = true;
      return;
    }
    const record = toRequestRecord(
      req.url(),
      { resourceType: req.resourceType(), method: req.method() },
      phase,
      opts.siteDomain,
      opts.matcher,
    );
    if (!record) return;
    requests.push(record);
    byRequest.set(req, record);
  });
  context.on('requestfailed', (req) => {
    const record = byRequest.get(req);
    if (record) record.failure = (req.failure()?.errorText ?? 'failed').slice(0, 100);
  });

  const evidence: ModeEvidence = {
    mode,
    finalUrl: opts.targetUrl,
    capturedAt: 0,
    banner: { found: false, buttons: [], precheckedLabels: [], revisitControlFound: false },
    requests,
    cookies: [],
    storageKeys: { local: [], session: [] },
    blockedRequests: opts.blockedSink,
    truncated: false,
  };

  try {
    const page = await context.newPage();
    page.on('dialog', (d) => void d.dismiss().catch(() => undefined));
    context.on('page', (p) => {
      if (p !== page) void p.close().catch(() => undefined);
    });

    const navError = await navigate(page, opts.targetUrl, opts.navTimeoutMs);
    if (navError) evidence.error = navError;
    await sleep(opts.settleMs);
    await screenshot(page, opts.screenshotDir, `${mode}-1-loaded.png`);

    const banner = await detectBanner(page);
    evidence.banner = banner.detection;

    const snapshot = async (): Promise<CookieSnapshot> =>
      new Map((await context.cookies()).map((c) => [cookieKey(c), c.expires]));
    let preAction: CookieSnapshot | undefined;
    let preReload: CookieSnapshot | undefined;
    if (mode !== 'baseline') {
      preAction = await snapshot();
      phase = 'post-action';
      const result = await clickConsent(banner, mode, CLICK_TIMEOUT_MS);
      evidence.action = { kind: mode, ...result };
      if (result.clicked) {
        await sleep(opts.settleMs);
        // Reload: many sites only apply (or ignore) consent on the next page view.
        preReload = await snapshot();
        phase = 'post-reload';
        const reloadError = await navigate(page, page.url(), opts.navTimeoutMs);
        if (reloadError) evidence.error ??= `reload:${reloadError}`;
        await sleep(opts.settleMs);
        await screenshot(page, opts.screenshotDir, `${mode}-2-after-reload.png`);
        evidence.banner.revisitControlFound ||= await detectRevisitControl(page);
      }
    }

    evidence.finalUrl = page.url();
    evidence.cookies = (await context.cookies()).map((c) =>
      toCookieRecord(c, cookiePhase(c, preAction, preReload), opts.siteDomain, opts.matcher),
    );
    evidence.storageKeys = await storageKeys(page);
  } catch (error) {
    evidence.error = error instanceof Error ? `mode-failed:${error.name}` : 'mode-failed';
  } finally {
    evidence.truncated = truncated;
    evidence.capturedAt = Math.floor(Date.now() / 1000);
    await context.close().catch(() => undefined);
  }
  return evidence;
}
