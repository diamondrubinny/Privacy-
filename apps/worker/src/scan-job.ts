import { randomUUID } from 'node:crypto';
import { collectEvidence, DEFAULT_POLICY, type CollectOptions } from '@privacyscan/collectors';
import { buildInventory, RULESET_VERSION, runRules, summarizeFindings } from '@privacyscan/rules';
import type { BrowserMode, ScanResult } from '@privacyscan/shared';
import { createDefaultMatcher } from '@privacyscan/tracker-db';
import type { ScannerConfig } from './config.js';

export const DISCLAIMER =
  'דוח זה מציג ממצאים טכניים אוטומטיים בנקודת זמן מסוימת ואינו מהווה ייעוץ משפטי או אישור עמידה בחוק הגנת הפרטיות, ' +
  'ב-GDPR או בתקני נגישות. תוצאות עשויות להשתנות לפי מיקום, מכשיר ותוכן דינמי. יש להתייעץ עם עורך דין או ממונה פרטיות.';

export interface ScanJobInput {
  url: string;
  modes: readonly BrowserMode[];
  screenshotDir?: string;
  /** Skip the multi-page audit (consent analysis only). */
  skipAudit?: boolean;
  /** Test hooks; never set from user input. */
  overrides?: Pick<CollectOptions, 'hostOverrides' | 'resolver' | 'matcher'>;
}

export async function runScan(input: ScanJobInput, config: ScannerConfig): Promise<ScanResult> {
  const startedAt = new Date().toISOString();
  const matcher = input.overrides?.matcher ?? createDefaultMatcher();
  const { evidence, environment } = await collectEvidence({
    url: input.url,
    modes: input.modes,
    navTimeoutMs: config.SCANNER_NAV_TIMEOUT_MS,
    settleMs: config.SCANNER_SETTLE_MS,
    maxRequestsPerMode: config.SCANNER_MAX_REQUESTS_PER_MODE,
    policy: {
      ...DEFAULT_POLICY,
      allowPrivateNetworks: config.SCANNER_UNSAFE_ALLOW_PRIVATE_NETWORKS,
    },
    matcher,
    ignoreHttpsErrors: config.SCANNER_UNSAFE_IGNORE_HTTPS_ERRORS,
    ...(config.SCANNER_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: config.SCANNER_CHROMIUM_EXECUTABLE_PATH }
      : {}),
    ...(config.SCANNER_BOT_INFO_URL ? { botInfoUrl: config.SCANNER_BOT_INFO_URL } : {}),
    ...(config.SCANNER_UPSTREAM_PROXY
      ? { upstreamProxy: new URL(config.SCANNER_UPSTREAM_PROXY) }
      : {}),
    ...(input.overrides?.hostOverrides ? { hostOverrides: input.overrides.hostOverrides } : {}),
    ...(input.overrides?.resolver ? { resolver: input.overrides.resolver } : {}),
    ...(input.screenshotDir ? { screenshotDir: input.screenshotDir } : {}),
    audit: input.skipAudit
      ? false
      : {
          maxPages: config.SCANNER_MAX_PAGES,
          crawlDelayMs: config.SCANNER_CRAWL_DELAY_MS,
          a11yMaxPages: config.SCANNER_A11Y_MAX_PAGES,
        },
    chromiumSandbox: config.SCANNER_CHROMIUM_SANDBOX,
    ...(config.SCANNER_LOCATION ? { scanLocation: config.SCANNER_LOCATION } : {}),
  });
  const { findings, ruleErrors } = runRules(evidence);
  return {
    schemaVersion: 1,
    scanId: randomUUID(),
    targetUrl: evidence.targetUrl,
    siteDomain: evidence.siteDomain,
    startedAt,
    finishedAt: new Date().toISOString(),
    rulesetVersion: RULESET_VERSION,
    trackerDbVersion: matcher.version,
    environment,
    disclaimer: DISCLAIMER,
    evidence,
    inventory: buildInventory(evidence),
    findings,
    ruleErrors,
    summary: summarizeFindings(findings),
  };
}
