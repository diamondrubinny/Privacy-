import type { BrowserMode, ModeEvidence, ScanEvidence, ScanResult } from '@privacyscan/shared';
import type { TrackerMatcher } from '@privacyscan/tracker-db';
import { chromium } from 'playwright-core';
import {
  assertPublicUrl,
  bareHostname,
  parseTargetUrl,
  type AddressPolicy,
  type Resolver,
} from './net/address-policy.js';
import { EgressProxy, type HostOverride } from './net/egress-proxy.js';
import { registrableDomain, runMode } from './browser/run-mode.js';

export interface CollectOptions {
  url: string;
  modes: readonly BrowserMode[];
  navTimeoutMs: number;
  settleMs: number;
  maxRequestsPerMode: number;
  policy: AddressPolicy;
  matcher: TrackerMatcher;
  executablePath?: string;
  /** Public URL describing the bot; appended to the User-Agent for transparency. */
  botInfoUrl?: string;
  resolver?: Resolver;
  hostOverrides?: ReadonlyMap<string, HostOverride>;
  upstreamProxy?: URL;
  /** Development only (e.g. TLS-intercepting corporate proxy). */
  ignoreHttpsErrors?: boolean;
  /** Local troubleshooting only; screenshots may contain personal data shown on the site. */
  screenshotDir?: string;
}

export interface CollectResult {
  evidence: ScanEvidence;
  environment: ScanResult['environment'];
}

const LOCALE = 'he-IL';
const TIMEZONE = 'Asia/Jerusalem';
const VIEWPORT = { width: 1366, height: 768 };

const CHROMIUM_ARGS = [
  // Keep all page traffic on the (policed) HTTP proxy path.
  '--disable-quic',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-domain-reliability',
  '--disable-sync',
  '--no-first-run',
];

function buildUserAgent(browserVersion: string, botInfoUrl: string | undefined): string {
  const major = browserVersion.split('.')[0] ?? '0';
  const bot = botInfoUrl ? `PrivacyScanBot/0.1 (+${botInfoUrl})` : 'PrivacyScanBot/0.1';
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 ${bot}`;
}

/** Validates the target, then runs each browser mode sequentially behind the egress proxy. */
export async function collectEvidence(opts: CollectOptions): Promise<CollectResult> {
  const target = parseTargetUrl(opts.url);
  const host = bareHostname(target.hostname).toLowerCase();
  if (!opts.hostOverrides?.has(host)) {
    await assertPublicUrl(target, opts.policy, opts.resolver);
  }
  const siteDomain = registrableDomain(host);

  let blockedSink: { host: string; reason: string }[] = [];
  const proxy = new EgressProxy({
    policy: opts.policy,
    ...(opts.resolver ? { resolver: opts.resolver } : {}),
    ...(opts.hostOverrides ? { hostOverrides: opts.hostOverrides } : {}),
    ...(opts.upstreamProxy ? { upstreamProxy: opts.upstreamProxy } : {}),
    onBlocked: (event) => {
      if (blockedSink.length < 200) blockedSink.push(event);
    },
  });
  const proxyPort = await proxy.start();

  try {
    const browser = await chromium.launch({
      headless: true,
      ...(opts.executablePath ? { executablePath: opts.executablePath } : {}),
      args: CHROMIUM_ARGS,
      // Playwright adds "<-loopback>" so even 127.0.0.1 goes through the proxy.
      proxy: { server: `http://127.0.0.1:${proxyPort}` },
    });
    try {
      const browserVersion = browser.version();
      const userAgent = buildUserAgent(browserVersion, opts.botInfoUrl);
      const modes: Partial<Record<BrowserMode, ModeEvidence>> = {};
      for (const mode of opts.modes) {
        blockedSink = [];
        modes[mode] = await runMode(browser, mode, {
          targetUrl: target.href,
          siteDomain,
          navTimeoutMs: opts.navTimeoutMs,
          settleMs: opts.settleMs,
          maxRequests: opts.maxRequestsPerMode,
          userAgent,
          locale: LOCALE,
          timezoneId: TIMEZONE,
          viewport: VIEWPORT,
          ignoreHttpsErrors: opts.ignoreHttpsErrors ?? false,
          matcher: opts.matcher,
          blockedSink,
          ...(opts.screenshotDir ? { screenshotDir: opts.screenshotDir } : {}),
        });
      }
      return {
        evidence: { targetUrl: target.href, siteDomain, modes },
        environment: {
          browserVersion,
          userAgent,
          locale: LOCALE,
          timezoneId: TIMEZONE,
          viewport: VIEWPORT,
        },
      };
    } finally {
      await browser.close();
    }
  } finally {
    await proxy.stop();
  }
}
