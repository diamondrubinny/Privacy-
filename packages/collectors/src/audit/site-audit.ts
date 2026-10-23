import type {
  AuditedPage,
  FormEvidence,
  LegalLinkRole,
  LinkRef,
  PageRole,
  PolicyEvidence,
  SecurityEvidence,
  SiteAuditEvidence,
} from '@privacyscan/shared';
import type { BrowserContext, Page, Response } from 'playwright-core';
import { runAxe } from './a11y.js';
import { classifyLinks, sameSite } from './links.js';
import {
  FORMS_SCRIPT,
  PAGE_INFO_SCRIPT,
  POLICY_TEXT_SCRIPT,
  type PageInfo,
  type PolicyText,
  type RawForm,
} from './page-scripts.js';
import { buildRobotsPolicy, type RobotsPolicy } from './robots.js';

export interface AuditOptions {
  targetUrl: string;
  siteDomain: string;
  navTimeoutMs: number;
  /** Wait after each load for client-side rendering (forms are often injected by JS). */
  pageSettleMs: number;
  /** Total pages including the home page. */
  maxPages: number;
  crawlDelayMs: number;
  a11yMaxPages: number;
  newContext: () => Promise<BrowserContext>;
}

/** Response headers worth keeping for security analysis; everything else is dropped. */
const SECURITY_HEADERS = [
  'strict-transport-security',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
  'x-powered-by',
  'server',
];

const LEGAL_ORDER: LegalLinkRole[] = ['privacy', 'accessibility', 'terms', 'cookies', 'contact'];

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function stripQuery(raw: string): { origin: string; path: string } | undefined {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return { origin: url.origin, path: url.pathname.slice(0, 200) };
  } catch {
    return undefined;
  }
}

async function goto(
  page: Page,
  url: string,
  timeout: number,
): Promise<{ response: Response | null; error?: string }> {
  try {
    return { response: await page.goto(url, { waitUntil: 'load', timeout }) };
  } catch (error) {
    const name =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'navigation-timeout'
        : 'navigation-failed';
    return { response: null, error: name };
  }
}

async function pageInfo(page: Page): Promise<PageInfo | null> {
  try {
    return await page.evaluate<PageInfo>(PAGE_INFO_SCRIPT);
  } catch {
    return null;
  }
}

/** Collects forms from every frame (embedded form vendors often use iframes). */
async function collectForms(page: Page, pageUrl: string): Promise<FormEvidence[]> {
  const forms: FormEvidence[] = [];
  const main = page.mainFrame();
  for (const frame of page.frames()) {
    let raw: RawForm[];
    try {
      raw = await frame.evaluate<RawForm[]>(FORMS_SCRIPT);
    } catch {
      continue;
    }
    const frameOrigin = frame === main ? undefined : stripQuery(frame.url())?.origin;
    for (const f of raw) {
      const action = f.action ? stripQuery(f.action) : undefined;
      forms.push({
        pageUrl,
        ...(frameOrigin ? { frameOrigin } : {}),
        index: forms.length,
        kind: f.kind,
        visible: f.visible,
        ...(action ? { action } : {}),
        method: f.method,
        fields: f.fields,
        checkboxes: f.checkboxes,
        contextText: f.contextText,
        contextLinks: f.contextLinks
          .map((l) => ({
            url: stripQuery(l.url) ? (l.url.split('?')[0] ?? l.url) : '',
            text: l.text,
          }))
          .filter((l) => l.url !== ''),
      });
    }
  }
  return forms;
}

async function securityOf(response: Response | null, finalUrl: string): Promise<SecurityEvidence> {
  const evidence: SecurityEvidence = { finalUrl, headers: {}, httpRedirectsToHttps: null };
  if (!response) return evidence;
  evidence.status = response.status();
  const headers = await response.allHeaders().catch((): Record<string, string> => ({}));
  for (const name of SECURITY_HEADERS) {
    const value = headers[name];
    if (value !== undefined) evidence.headers[name] = value.slice(0, 1000);
  }
  const details = await response.securityDetails().catch(() => null);
  if (details?.protocol) {
    evidence.tls = {
      protocol: details.protocol,
      ...(details.issuer ? { issuer: details.issuer.slice(0, 200) } : {}),
      ...(details.validTo ? { validTo: details.validTo } : {}),
    };
  }
  return evidence;
}

async function fetchRobots(page: Page, origin: string, timeout: number): Promise<RobotsPolicy> {
  const robotsUrl = `${origin}/robots.txt`;
  const { response } = await goto(page, robotsUrl, timeout);
  if (!response) return buildRobotsPolicy(robotsUrl, null, '');
  const body = response.ok() ? await response.text().catch(() => '') : '';
  return buildRobotsPolicy(robotsUrl, response.status(), body);
}

interface PlannedPage {
  url: string;
  role: PageRole;
}

/**
 * Crawls a small, purposeful set of pages: legal pages, contact and form-bearing pages.
 * Discovered same-site pages respect robots.txt; the user-requested target is always scanned.
 */
export async function runSiteAudit(opts: AuditOptions): Promise<SiteAuditEvidence> {
  const audit: SiteAuditEvidence = {
    capturedAt: Math.floor(Date.now() / 1000),
    robots: { status: null, disallowedSkipped: [] },
    pages: [],
    legalLinks: {},
  };
  const context = await opts.newContext();
  try {
    const page = await context.newPage();
    page.on('dialog', (d) => void d.dismiss().catch(() => undefined));
    context.on('page', (p) => {
      if (p !== page) void p.close().catch(() => undefined);
    });

    let a11yRuns = 0;
    const visit = async (planned: PlannedPage): Promise<AuditedPage> => {
      const { response, error } = await goto(page, planned.url, opts.navTimeoutMs);
      await sleep(opts.pageSettleMs);
      const finalUrl = page.url();
      const info = await pageInfo(page);
      const audited: AuditedPage = {
        url: planned.url,
        finalUrl,
        role: planned.role,
        ...(response ? { status: response.status() } : {}),
        ...(error ? { error } : {}),
        ...(info?.lang ? { lang: info.lang } : {}),
        ...(info?.title ? { title: info.title } : {}),
        ...(info?.hebrewRatio != null ? { hebrewRatio: info.hebrewRatio } : {}),
        ...(info?.insecureResources.length ? { insecureResources: info.insecureResources } : {}),
        forms: response ? await collectForms(page, finalUrl) : [],
      };
      const wantsA11y =
        planned.role === 'home' || planned.role === 'contact' || planned.role === 'other';
      if (response && wantsA11y && a11yRuns < opts.a11yMaxPages) {
        a11yRuns++;
        audited.a11y = await runAxe(page);
      }
      if (planned.role === 'privacy') {
        audit.policy = await policyOf(page, planned.url, response, error);
      }
      audit.pages.push(audited);
      return audited;
    };

    // 1) Home page: links, security headers, forms, accessibility.
    const homeNav = await goto(page, opts.targetUrl, opts.navTimeoutMs);
    await sleep(opts.pageSettleMs);
    const homeFinal = page.url();
    audit.security = await securityOf(homeNav.response, homeFinal);
    const homeInfo = await pageInfo(page);
    const home: AuditedPage = {
      url: opts.targetUrl,
      finalUrl: homeFinal,
      role: 'home',
      ...(homeNav.response ? { status: homeNav.response.status() } : {}),
      ...(homeNav.error ? { error: homeNav.error } : {}),
      ...(homeInfo?.lang ? { lang: homeInfo.lang } : {}),
      ...(homeInfo?.title ? { title: homeInfo.title } : {}),
      ...(homeInfo?.hebrewRatio != null ? { hebrewRatio: homeInfo.hebrewRatio } : {}),
      ...(homeInfo?.insecureResources.length
        ? { insecureResources: homeInfo.insecureResources }
        : {}),
      forms: homeNav.response ? await collectForms(page, homeFinal) : [],
    };
    if (homeNav.response && opts.a11yMaxPages > 0) {
      a11yRuns++;
      home.a11y = await runAxe(page);
    }
    audit.pages.push(home);
    if (!homeNav.response) return audit;

    const links = classifyLinks(homeInfo?.links ?? [], homeFinal, opts.siteDomain);
    audit.legalLinks = links.legal;

    // 2) robots.txt of the site's origin.
    const origin = new URL(homeFinal).origin;
    const robots = await fetchRobots(page, origin, Math.min(opts.navTimeoutMs, 10_000));
    audit.robots.status = robots.status;

    // 3) Plan: legal pages first, then form-bearing pages, then other same-site pages.
    const planned: PlannedPage[] = [];
    const seen = new Set<string>([homeFinal, opts.targetUrl]);
    const add = (ref: LinkRef, role: PageRole): void => {
      if (planned.length >= opts.maxPages - 1 || seen.has(ref.url)) return;
      seen.add(ref.url);
      const url = new URL(ref.url);
      // robots.txt applies to the scanned site; off-site legal pages are single linked documents.
      if (sameSite(url, opts.siteDomain) && !robots.isAllowed(ref.url)) {
        audit.robots.disallowedSkipped.push(ref.url);
        return;
      }
      planned.push({ url: ref.url, role });
    };
    for (const role of LEGAL_ORDER) {
      const ref = links.legal[role];
      if (ref) add(ref, role);
    }
    for (const ref of links.formCandidates) add(ref, 'other');
    for (const ref of links.others.slice(0, 2)) add(ref, 'other');

    // 4) Visit sequentially with a politeness delay.
    for (const p of planned) {
      await sleep(opts.crawlDelayMs);
      await visit(p);
    }

    // 5) Does plain HTTP redirect to HTTPS?
    if (homeFinal.startsWith('https:')) {
      const httpUrl = new URL(homeFinal);
      httpUrl.protocol = 'http:';
      httpUrl.pathname = '/';
      httpUrl.search = '';
      const nav = await goto(page, httpUrl.href, Math.min(opts.navTimeoutMs, 15_000));
      const status = nav.response?.status() ?? 0;
      // "No redirect" only when the site actually served content over HTTP; errors are inconclusive.
      audit.security.httpRedirectsToHttps = page.url().startsWith('https:')
        ? true
        : status >= 200 && status < 300
          ? false
          : null;
    }
  } catch (error) {
    audit.error = error instanceof Error ? `audit-failed:${error.name}` : 'audit-failed';
  } finally {
    await context.close().catch(() => undefined);
  }
  return audit;
}

async function policyOf(
  page: Page,
  url: string,
  response: Response | null,
  error: string | undefined,
): Promise<PolicyEvidence> {
  const policy: PolicyEvidence = {
    url,
    text: '',
    truncated: false,
    ...(response ? { status: response.status() } : {}),
    ...(error ? { error } : {}),
  };
  if (!response) return policy;
  try {
    const t = await page.evaluate<PolicyText>(POLICY_TEXT_SCRIPT);
    policy.text = t.text;
    policy.truncated = t.truncated;
    if (t.lang) policy.lang = t.lang;
  } catch {
    policy.error = 'extract-failed';
  }
  return policy;
}
