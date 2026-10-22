import type {
  BannerDetection,
  CookieRecord,
  ModeEvidence,
  RequestRecord,
  Rule,
  ScanEvidence,
  TrackerMatch,
} from '@privacyscan/shared';
import { describe, expect, it } from 'vitest';
import { buildInventory, DEFAULT_RULES, runRules, summarizeFindings } from './index.js';

const NOW = 1_800_000_000;

const GA: TrackerMatch = {
  vendor: 'Google Analytics',
  category: 'analytics',
  entryId: 'google-analytics',
};
const META: TrackerMatch = { vendor: 'Meta Pixel', category: 'marketing', entryId: 'meta-pixel' };
const FONTS: TrackerMatch = {
  vendor: 'Google Fonts',
  category: 'functional',
  entryId: 'google-fonts',
};
const PLAUSIBLE: TrackerMatch = {
  vendor: 'Plausible Analytics',
  category: 'analytics',
  entryId: 'plausible',
  lowRisk: true,
};

function req(
  hostname: string,
  tracker?: TrackerMatch,
  extra: Partial<RequestRecord> = {},
): RequestRecord {
  return {
    origin: `https://${hostname}`,
    path: '/',
    queryKeys: [],
    resourceType: 'script',
    method: 'GET',
    hostname,
    thirdParty: hostname !== 'shop.co.il',
    phase: 'pre-action',
    ...(tracker ? { tracker } : {}),
    ...extra,
  };
}

function cookie(
  name: string,
  tracker?: TrackerMatch,
  extra: Partial<CookieRecord> = {},
): CookieRecord {
  return {
    name,
    domain: '.shop.co.il',
    path: '/',
    expires: NOW + 30 * 86_400,
    secure: true,
    httpOnly: false,
    sameSite: 'Lax',
    thirdParty: false,
    phase: 'pre-action',
    ...(tracker ? { tracker } : {}),
    ...extra,
  };
}

const NO_BANNER: BannerDetection = {
  found: false,
  buttons: [],
  precheckedLabels: [],
  revisitControlFound: false,
};

const GOOD_BANNER: BannerDetection = {
  found: true,
  cmp: 'generic',
  buttons: [
    { kind: 'accept', text: 'אישור הכל', source: 'heuristic' },
    { kind: 'reject', text: 'דחיית הכל', source: 'heuristic' },
  ],
  precheckedLabels: [],
  revisitControlFound: true,
};

function mode(m: ModeEvidence['mode'], partial: Partial<ModeEvidence> = {}): ModeEvidence {
  return {
    mode: m,
    finalUrl: 'https://shop.co.il/',
    capturedAt: NOW,
    banner: GOOD_BANNER,
    requests: [],
    cookies: [],
    storageKeys: { local: [], session: [] },
    blockedRequests: [],
    truncated: false,
    ...partial,
  };
}

function evidence(modes: ModeEvidence[]): ScanEvidence {
  return {
    targetUrl: 'https://shop.co.il/',
    siteDomain: 'shop.co.il',
    modes: Object.fromEntries(modes.map((m) => [m.mode, m])),
  };
}

const ids = (e: ScanEvidence): string[] => runRules(e).findings.map((f) => f.ruleId);

describe('compliant site', () => {
  it('produces no cookie findings', () => {
    const e = evidence([
      mode('baseline', { requests: [req('shop.co.il'), req('fonts.googleapis.com', FONTS)] }),
      mode('reject', { action: { kind: 'reject', clicked: true } }),
      mode('accept', {
        action: { kind: 'accept', clicked: true },
        requests: [req('www.google-analytics.com', GA, { phase: 'post-action' })],
        cookies: [cookie('_ga', GA, { phase: 'post-action' })],
      }),
    ]);
    expect(runRules(e).findings).toEqual([]);
  });
});

describe('CK-PRECONSENT', () => {
  it('reports each vendor once with evidence refs, severity high', () => {
    const e = evidence([
      mode('baseline', {
        requests: [
          req('www.google-analytics.com', GA),
          req('connect.facebook.net', META),
          req('region1.google-analytics.com', GA),
        ],
        cookies: [cookie('_ga', GA)],
      }),
    ]);
    const findings = runRules(e).findings.filter((f) => f.ruleId === 'CK-PRECONSENT');
    expect(findings.map((f) => f.title)).toEqual([
      'Google Analytics פועל לפני שהמשתמש נתן הסכמה',
      'Meta Pixel פועל לפני שהמשתמש נתן הסכמה',
    ]);
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.evidence[0]?.refs).toEqual([
      'baseline.requests[0]',
      'baseline.requests[2]',
      'baseline.cookies[0]',
    ]);
  });

  it('ignores functional/essential trackers', () => {
    const e = evidence([mode('baseline', { requests: [req('fonts.googleapis.com', FONTS)] })]);
    expect(ids(e)).not.toContain('CK-PRECONSENT');
  });

  it('downgrades Consent Mode denied pings without cookies to medium', () => {
    const e = evidence([
      mode('baseline', {
        requests: [req('www.google-analytics.com', GA, { consentSignal: 'G100' })],
      }),
    ]);
    const f = runRules(e).findings.find((x) => x.ruleId === 'CK-PRECONSENT');
    expect(f?.severity).toBe('medium');
    expect(f?.description).toContain('G100');
  });

  it('downgrades low-risk tools to low', () => {
    const e = evidence([mode('baseline', { requests: [req('plausible.io', PLAUSIBLE)] })]);
    expect(runRules(e).findings.find((x) => x.ruleId === 'CK-PRECONSENT')?.severity).toBe('low');
  });

  it('falls back to the pre-action phase when baseline did not run, keeping indices valid', () => {
    const e = evidence([
      mode('reject', {
        action: { kind: 'reject', clicked: true },
        requests: [req('shop.co.il'), req('www.google-analytics.com', GA)],
      }),
    ]);
    const f = runRules(e).findings.find((x) => x.ruleId === 'CK-PRECONSENT');
    expect(f?.evidence[0]?.refs).toEqual(['reject.requests[1]']);
  });
});

describe('CK-REJECT-IGNORED', () => {
  it('is critical when trackers fire after reject', () => {
    const e = evidence([
      mode('reject', {
        action: { kind: 'reject', clicked: true },
        requests: [req('connect.facebook.net', META, { phase: 'post-reload' })],
        cookies: [cookie('_fbp', META, { phase: 'post-reload' })],
      }),
    ]);
    const f = runRules(e).findings.find((x) => x.ruleId === 'CK-REJECT-IGNORED');
    expect(f?.severity).toBe('critical');
    expect(runRules(e).findings[0]?.ruleId).toBe('CK-REJECT-IGNORED'); // sorted first
  });

  it('ignores beacons between the click and the reload', () => {
    const e = evidence([
      mode('reject', {
        action: { kind: 'reject', clicked: true },
        requests: [req('www.google-analytics.com', GA, { phase: 'post-action' })],
        cookies: [cookie('_ga', GA, { phase: 'post-action' })],
      }),
    ]);
    expect(ids(e)).not.toContain('CK-REJECT-IGNORED');
  });

  it('ignores pre-action observations and unclicked rejects', () => {
    const pre = evidence([
      mode('reject', { action: { kind: 'reject', clicked: true }, cookies: [cookie('_ga', GA)] }),
    ]);
    expect(ids(pre)).not.toContain('CK-REJECT-IGNORED');
    const unclicked = evidence([
      mode('reject', {
        action: { kind: 'reject', clicked: false, error: 'button-not-found' },
        requests: [req('connect.facebook.net', META, { phase: 'post-reload' })],
      }),
    ]);
    expect(ids(unclicked)).not.toContain('CK-REJECT-IGNORED');
  });
});

describe('banner rules', () => {
  it('CK-NO-BANNER only when consent trackers exist', () => {
    expect(ids(evidence([mode('baseline', { banner: NO_BANNER })]))).toEqual([]);
    expect(
      ids(
        evidence([
          mode('baseline', { banner: NO_BANNER, requests: [req('connect.facebook.net', META)] }),
        ]),
      ),
    ).toContain('CK-NO-BANNER');
  });

  it('CK-NO-REJECT when accept exists without reject', () => {
    const banner: BannerDetection = {
      ...GOOD_BANNER,
      buttons: [
        { kind: 'accept', text: 'אישור', source: 'heuristic' },
        { kind: 'settings', text: 'הגדרות', source: 'heuristic' },
      ],
    };
    expect(ids(evidence([mode('baseline', { banner })]))).toContain('CK-NO-REJECT');
  });

  it('CK-NOTICE-ONLY for "got it" banners', () => {
    const banner: BannerDetection = {
      ...GOOD_BANNER,
      buttons: [{ kind: 'acknowledge', text: 'הבנתי', source: 'heuristic' }],
    };
    const f = runRules(evidence([mode('baseline', { banner })])).findings;
    expect(f.map((x) => x.ruleId)).toEqual(['CK-NOTICE-ONLY']);
    expect(f[0]?.severity).toBe('low');
  });

  it('CK-PRECHECKED lists the labels', () => {
    const banner: BannerDetection = { ...GOOD_BANNER, precheckedLabels: ['שיווק'] };
    const f = runRules(evidence([mode('baseline', { banner })])).findings;
    expect(f[0]?.ruleId).toBe('CK-PRECHECKED');
    expect(f[0]?.evidence[0]?.summary).toContain('שיווק');
  });

  it('CK-NO-REVISIT only after a successful click', () => {
    const banner: BannerDetection = { ...GOOD_BANNER, revisitControlFound: false };
    expect(ids(evidence([mode('baseline', { banner })]))).not.toContain('CK-NO-REVISIT');
    expect(
      ids(evidence([mode('accept', { banner, action: { kind: 'accept', clicked: true } })])),
    ).toContain('CK-NO-REVISIT');
  });

  it('CK-ACTION-FAILED is informational', () => {
    const f = runRules(
      evidence([
        mode('accept', { action: { kind: 'accept', clicked: false, error: 'click-failed' } }),
      ]),
    ).findings;
    expect(f.map((x) => [x.ruleId, x.severity])).toEqual([['CK-ACTION-FAILED', 'info']]);
  });
});

describe('CK-LONG-RETENTION', () => {
  it('flags consent-requiring cookies above 13 months only', () => {
    const e = evidence([
      mode('accept', {
        action: { kind: 'accept', clicked: true },
        cookies: [
          cookie('_ga', GA, { expires: NOW + 400 * 86_400, phase: 'post-action' }),
          cookie('_gid', GA, { expires: NOW + 86_400, phase: 'post-action' }),
          cookie('session', undefined, { expires: NOW + 800 * 86_400 }),
        ],
      }),
    ]);
    const f = runRules(e).findings.find((x) => x.ruleId === 'CK-LONG-RETENTION');
    expect(f?.evidence[0]?.summary).toBe('_ga: 400 ימים');
  });
});

describe('engine', () => {
  it('isolates failing rules', () => {
    const broken: Rule = {
      id: 'X-BROKEN',
      version: '0.0.1',
      category: 'cookies',
      jurisdictions: ['EU'],
      evaluate: () => {
        throw new Error('boom');
      },
    };
    const out = runRules(evidence([mode('baseline', { banner: NO_BANNER })]), [
      broken,
      ...DEFAULT_RULES,
    ]);
    expect(out.ruleErrors).toEqual([{ ruleId: 'X-BROKEN', message: 'boom' }]);
  });

  it('summarizes risk per category without a compliance percentage', () => {
    const e = evidence([
      mode('baseline', { banner: NO_BANNER, requests: [req('connect.facebook.net', META)] }),
    ]);
    const summary = summarizeFindings(runRules(e).findings);
    expect(summary.cookies).toEqual({ risk: 'high', count: 2 });
    expect(summary.policy).toEqual({ risk: 'none', count: 0 });
  });

  it('rule ids are unique', () => {
    const all = DEFAULT_RULES.map((r) => r.id);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('buildInventory', () => {
  it('includes vendors seen only through cookies', () => {
    const inv = buildInventory(evidence([mode('baseline', { cookies: [cookie('_ga', GA)] })]));
    expect(inv.trackers).toEqual([
      {
        vendor: 'Google Analytics',
        category: 'analytics',
        hostnames: [],
        seenIn: ['baseline'],
        beforeConsent: true,
      },
    ]);
  });

  it('merges vendors across modes and flags before-consent usage', () => {
    const e = evidence([
      mode('baseline', { requests: [req('www.google-analytics.com', GA), req('cdn.unknown.net')] }),
      mode('accept', {
        action: { kind: 'accept', clicked: true },
        requests: [req('connect.facebook.net', META, { phase: 'post-action' })],
        cookies: [cookie('_fbp', META, { phase: 'post-action', expires: NOW + 90 * 86_400 })],
      }),
    ]);
    const inv = buildInventory(e);
    expect(inv.trackers.map((t) => [t.vendor, t.beforeConsent, t.seenIn])).toEqual([
      ['Google Analytics', true, ['baseline']],
      ['Meta Pixel', false, ['accept']],
    ]);
    expect(inv.cookies[0]).toMatchObject({
      name: '_fbp',
      vendor: 'Meta Pixel',
      maxLifetimeDays: 90,
    });
    expect(inv.unclassifiedThirdPartyHosts).toEqual(['cdn.unknown.net']);
  });
});
