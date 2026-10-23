import type {
  A11yViolation,
  AuditedPage,
  FormEvidence,
  FormFieldEvidence,
  ModeEvidence,
  ScanEvidence,
  SiteAuditEvidence,
} from '@privacyscan/shared';
import { describe, expect, it } from 'vitest';
import { runRules } from './index.js';

const NOW = 1_800_000_000;

const field = (hints: string, type = 'text'): FormFieldEvidence => ({
  tag: type === 'textarea' ? 'textarea' : 'input',
  type,
  hints,
  autocomplete: '',
  required: false,
});

function form(partial: Partial<FormEvidence> = {}): FormEvidence {
  return {
    pageUrl: 'https://shop.co.il/contact',
    index: 0,
    kind: 'form',
    visible: true,
    action: { origin: 'https://shop.co.il', path: '/send' },
    method: 'post',
    fields: [field('שם מלא'), field('טלפון', 'tel')],
    checkboxes: [],
    contextText: 'השאירו פרטים ונחזור אליכם',
    contextLinks: [],
    ...partial,
  };
}

function page(partial: Partial<AuditedPage> = {}): AuditedPage {
  return {
    url: 'https://shop.co.il/',
    finalUrl: 'https://shop.co.il/',
    role: 'home',
    status: 200,
    lang: 'he',
    hebrewRatio: 0.9,
    forms: [],
    ...partial,
  };
}

const GOOD_POLICY =
  'מדיניות פרטיות. עודכן לאחרונה: 01/10/2025. שופ בע"מ (ח.פ. 512345678) היא בעלת המאגר. ' +
  'המידע שנאסף כולל שם וטלפון וישמש לצורך מתן השירות. אינך חייב על פי חוק למסור את המידע. ' +
  'נעביר מידע לספקים ונותני שירות, חלקם מחוץ לישראל. המידע יישמר למשך 24 חודשים. ' +
  'אנו נוקטים אמצעי אבטחה. האתר משתמש בעוגיות. ניתן לעיין במידע, לתקנו ולמחקו בפנייה ל-privacy@shop.co.il. ' +
  'בסיס חוקי: הסכמה ואינטרס לגיטימי. ניתן להגיש תלונה לרשות להגנת הפרטיות. ' +
  'פרטים נוספים. '.repeat(120);

function audit(partial: Partial<SiteAuditEvidence> = {}): SiteAuditEvidence {
  return {
    capturedAt: NOW,
    robots: { status: 404, disallowedSkipped: [] },
    pages: [page()],
    legalLinks: {
      privacy: { url: 'https://shop.co.il/privacy', text: 'מדיניות פרטיות' },
      accessibility: { url: 'https://shop.co.il/a11y', text: 'הצהרת נגישות' },
    },
    security: {
      finalUrl: 'https://shop.co.il/',
      status: 200,
      headers: {
        'strict-transport-security': 'max-age=31536000; includeSubDomains',
        'content-security-policy': "default-src 'self'; frame-ancestors 'self'",
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin',
      },
      tls: { protocol: 'TLS 1.3', validTo: NOW + 90 * 86_400 },
      httpRedirectsToHttps: true,
    },
    policy: { url: 'https://shop.co.il/privacy', status: 200, text: GOOD_POLICY, truncated: false },
    ...partial,
  };
}

function noPolicy(a: SiteAuditEvidence): SiteAuditEvidence {
  const rest = { ...a };
  delete rest.policy;
  return rest;
}

function evidence(
  a: SiteAuditEvidence,
  modes: Partial<Record<string, ModeEvidence>> = {},
): ScanEvidence {
  return { targetUrl: 'https://shop.co.il/', siteDomain: 'shop.co.il', modes, audit: a };
}

const ids = (e: ScanEvidence): string[] =>
  runRules(e)
    .findings.map((f) => f.ruleId)
    .sort();

describe('baseline', () => {
  it('a well-configured site has no audit findings', () => {
    const contact = page({
      url: 'https://shop.co.il/contact',
      finalUrl: 'https://shop.co.il/contact',
      role: 'contact',
      forms: [form({ contextText: 'המידע ישמש לצורך מענה לפנייה. מדיניות הפרטיות' })],
    });
    expect(runRules(evidence(audit({ pages: [page(), contact] }))).findings).toEqual([]);
  });
});

describe('policy rules', () => {
  it('POL-MISSING when the home page loaded without a privacy link', () => {
    expect(ids(evidence(noPolicy(audit({ legalLinks: {} }))))).toContain('POL-MISSING');
    const failedHome = noPolicy(
      audit({ legalLinks: {}, pages: [page({ error: 'navigation-failed' })] }),
    );
    expect(ids(evidence(failedHome))).not.toContain('POL-MISSING');
  });

  it('POL-UNREACHABLE for 404 policy pages', () => {
    const a = audit({
      policy: { url: 'https://shop.co.il/privacy', status: 404, text: '', truncated: false },
    });
    expect(ids(evidence(a))).toContain('POL-UNREACHABLE');
  });

  it('POL-NOT-HEBREW for English-only policy on a Hebrew site', () => {
    const a = audit({
      policy: {
        url: 'x',
        status: 200,
        text: `Privacy policy. ${'We collect data. '.repeat(200)}`,
        truncated: false,
      },
    });
    expect(ids(evidence(a))).toContain('POL-NOT-HEBREW');
  });

  it('POL-ELEMENTS-MISSING lists core gaps with medium severity', () => {
    const a = audit({
      policy: {
        url: 'x',
        status: 200,
        text: `האתר משתמש בעוגיות. ${'א'.repeat(2000)}`,
        truncated: false,
      },
    });
    const f = runRules(evidence(a)).findings.find((x) => x.ruleId === 'POL-ELEMENTS-MISSING');
    expect(f?.severity).toBe('medium');
    expect(f?.description).toContain('זהות בעל המאגר');
  });

  it('POL-OUTDATED before Amendment 13', () => {
    const a = audit({
      policy: {
        url: 'x',
        status: 200,
        text: GOOD_POLICY.replace('01/10/2025', '01/03/2024'),
        truncated: false,
      },
    });
    expect(ids(evidence(a))).toContain('POL-OUTDATED');
  });
});

describe('form rules', () => {
  const withForms = (forms: FormEvidence[]): ScanEvidence =>
    evidence(
      audit({
        pages: [
          page(),
          page({ url: 'c', finalUrl: 'https://shop.co.il/c', role: 'contact', forms }),
        ],
      }),
    );

  it('FORM-NO-NOTICE for personal forms without a notice; skips search/login', () => {
    expect(ids(withForms([form()]))).toContain('FORM-NO-NOTICE');
    expect(ids(withForms([form({ fields: [field('חיפוש', 'search')] })]))).toEqual([]);
    expect(
      ids(withForms([form({ fields: [field('email', 'email'), field('סיסמה', 'password')] })])),
    ).toEqual([]);
    expect(
      ids(
        withForms([
          form({ contextLinks: [{ url: 'https://shop.co.il/privacy', text: 'פרטיות' }] }),
        ]),
      ),
    ).toEqual([]);
  });

  it('reports a repeated form (e.g. footer) once', () => {
    const e = evidence(
      audit({
        pages: [
          page({ forms: [form()] }),
          page({ url: 'b', finalUrl: 'https://shop.co.il/b', role: 'other', forms: [form()] }),
        ],
      }),
    );
    expect(runRules(e).findings.filter((f) => f.ruleId === 'FORM-NO-NOTICE')).toHaveLength(1);
  });

  it('FORM-SENSITIVE-DATA: high for health, medium for ID numbers', () => {
    const health = runRules(
      withForms([
        form({ fields: [field('שם'), field('פרטים רפואיים', 'textarea')], contextText: 'פרטיות' }),
      ]),
    ).findings;
    expect(health.find((f) => f.ruleId === 'FORM-SENSITIVE-DATA')?.severity).toBe('high');
    const id = runRules(
      withForms([form({ fields: [field('שם'), field('תעודת זהות')], contextText: 'פרטיות' })]),
    ).findings;
    expect(id.find((f) => f.ruleId === 'FORM-SENSITIVE-DATA')?.severity).toBe('medium');
  });

  it('FORM-INSECURE-SUBMIT for http targets', () => {
    const f = form({
      action: { origin: 'http://shop.co.il', path: '/send' },
      contextText: 'פרטיות',
    });
    expect(ids(withForms([f]))).toEqual(['FORM-INSECURE-SUBMIT']);
  });

  it('FORM-THIRD-PARTY-ACTION lists external processors', () => {
    const f = form({
      action: { origin: 'https://forms.hubspot.com', path: '/s' },
      contextText: 'פרטיות',
    });
    const out = runRules(withForms([f])).findings;
    expect(out.map((x) => x.ruleId)).toEqual(['FORM-THIRD-PARTY-ACTION']);
    expect(out[0]?.description).toContain('forms.hubspot.com');
  });

  it('SPAM-OPTIN-PRECHECKED and SPAM-OPTIN-BUNDLED', () => {
    const pre = form({
      contextText: 'פרטיות',
      checkboxes: [{ label: 'אשמח לקבל דיוור ומבצעים', checked: true, required: false }],
    });
    expect(ids(withForms([pre]))).toEqual(['SPAM-OPTIN-PRECHECKED']);
    const bundled = form({
      contextText: 'פרטיות',
      checkboxes: [{ label: 'קראתי ומסכים לתקנון ולקבלת דיוור', checked: false, required: true }],
    });
    expect(ids(withForms([bundled]))).toEqual(['SPAM-OPTIN-BUNDLED']);
    const ok = form({
      contextText: 'פרטיות',
      checkboxes: [{ label: 'אשמח לקבל דיוור', checked: false, required: false }],
    });
    expect(ids(withForms([ok]))).toEqual([]);
  });
});

describe('security rules', () => {
  const sec = (patch: Partial<NonNullable<SiteAuditEvidence['security']>>): ScanEvidence => {
    const a = audit();
    return evidence({
      ...a,
      security: { ...(a.security as NonNullable<SiteAuditEvidence['security']>), ...patch },
    });
  };

  it('SEC-NO-HTTPS for http sites and missing redirects', () => {
    expect(
      runRules(sec({ finalUrl: 'http://shop.co.il/' })).findings.find(
        (f) => f.ruleId === 'SEC-NO-HTTPS',
      )?.severity,
    ).toBe('high');
    expect(
      runRules(sec({ httpRedirectsToHttps: false })).findings.map((f) => [f.ruleId, f.severity]),
    ).toEqual([['SEC-NO-HTTPS', 'medium']]);
  });

  it('SEC-TLS for old protocols and expiring certificates (relative to capture time)', () => {
    expect(ids(sec({ tls: { protocol: 'TLS 1.0', validTo: NOW + 90 * 86_400 } }))).toEqual([
      'SEC-TLS',
    ]);
    const expiring = runRules(
      sec({ tls: { protocol: 'TLS 1.3', validTo: NOW + 5 * 86_400 } }),
    ).findings;
    expect(expiring[0]?.title).toContain('5 ימים');
  });

  it('SEC-HSTS and SEC-HEADERS', () => {
    expect(
      ids(
        sec({
          headers: {
            'content-security-policy': "frame-ancestors 'none'",
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'no-referrer',
          },
        }),
      ),
    ).toEqual(['SEC-HSTS']);
    const f = runRules(
      sec({
        headers: { 'strict-transport-security': 'max-age=63072000', 'x-powered-by': 'PHP/7.4.3' },
      }),
    ).findings;
    expect(f.map((x) => x.ruleId)).toEqual(['SEC-HEADERS']);
    expect(f[0]?.description).toContain('PHP/7.4.3');
  });

  it('SEC-MIXED-CONTENT and SEC-COOKIE-FLAGS from the baseline mode', () => {
    const baseline: ModeEvidence = {
      mode: 'baseline',
      finalUrl: 'https://shop.co.il/',
      capturedAt: NOW,
      banner: { found: false, buttons: [], precheckedLabels: [], revisitControlFound: false },
      requests: [
        {
          origin: 'http://cdn.shop.co.il',
          path: '/logo.png',
          queryKeys: [],
          resourceType: 'image',
          method: 'GET',
          hostname: 'cdn.shop.co.il',
          thirdParty: false,
          phase: 'pre-action',
        },
      ],
      cookies: [
        {
          name: 'PHPSESSID',
          domain: 'shop.co.il',
          path: '/',
          expires: -1,
          secure: false,
          httpOnly: false,
          sameSite: 'Lax',
          thirdParty: false,
          phase: 'pre-action',
        },
      ],
      storageKeys: { local: [], session: [] },
      blockedRequests: [],
      truncated: false,
    };
    const f = runRules(evidence(audit(), { baseline })).findings;
    expect(f.map((x) => x.ruleId).sort()).toEqual(['SEC-COOKIE-FLAGS', 'SEC-MIXED-CONTENT']);
    expect(f.find((x) => x.ruleId === 'SEC-COOKIE-FLAGS')?.severity).toBe('medium');
  });
});

describe('a11y rules', () => {
  const v = (id: string, impact: A11yViolation['impact'], nodes = 1): A11yViolation => ({
    id,
    impact,
    help: `help ${id}`,
    helpUrl: `https://dequeuniversity.com/rules/axe/4.14/${id}`,
    tags: ['wcag2a'],
    nodes,
    targets: [`#${id}`],
  });

  it('A11Y-STATEMENT-MISSING', () => {
    expect(ids(evidence(audit({ legalLinks: { privacy: { url: 'x', text: 'פרטיות' } } })))).toEqual(
      ['A11Y-STATEMENT-MISSING'],
    );
  });

  it('aggregates axe violations per rule across pages with mapped severity', () => {
    const a = audit({
      pages: [
        page({
          a11y: {
            engine: 'axe',
            locale: 'he',
            violations: [v('image-alt', 'critical', 2), v('color-contrast', 'serious')],
          },
        }),
        page({
          role: 'contact',
          finalUrl: 'https://shop.co.il/c',
          a11y: { engine: 'axe', locale: 'he', violations: [v('image-alt', 'critical', 3)] },
        }),
      ],
    });
    const f = runRules(evidence(a)).findings;
    expect(f.map((x) => [x.ruleId, x.severity])).toEqual([
      ['A11Y-AXE-image-alt', 'high'],
      ['A11Y-AXE-color-contrast', 'medium'],
    ]);
    expect(f[0]?.description).toContain('רכיבים בעייתיים: 5');
    expect(f[0]?.evidence[0]?.refs).toHaveLength(2);
  });

  it('A11Y-OVERLAY-ONLY when a widget coexists with serious violations', () => {
    const baseline = {
      mode: 'baseline',
      finalUrl: 'https://shop.co.il/',
      capturedAt: NOW,
      banner: { found: false, buttons: [], precheckedLabels: [], revisitControlFound: false },
      requests: [
        {
          origin: 'https://cdn.enable.co.il',
          path: '/a.js',
          queryKeys: [],
          resourceType: 'script',
          method: 'GET',
          hostname: 'cdn.enable.co.il',
          thirdParty: true,
          phase: 'pre-action',
          tracker: {
            vendor: 'Enable (accessibility widget)',
            category: 'functional',
            entryId: 'a11y-enable',
          },
        },
      ],
      cookies: [],
      storageKeys: { local: [], session: [] },
      blockedRequests: [],
      truncated: false,
    } satisfies ModeEvidence;
    const a = audit({
      pages: [
        page({ a11y: { engine: 'axe', locale: 'he', violations: [v('button-name', 'critical')] } }),
      ],
    });
    expect(ids(evidence(a, { baseline }))).toEqual(['A11Y-AXE-button-name', 'A11Y-OVERLAY-ONLY']);
  });
});
