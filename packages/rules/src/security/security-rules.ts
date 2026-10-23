import type { Rule, ScanEvidence, SecurityEvidence } from '@privacyscan/shared';
import { finding, REFS } from '../helpers.js';

/** HSTS max-age below 180 days is considered weak (common baseline; preload requires 1 year). */
const MIN_HSTS_SECONDS = 15_552_000;
const CERT_WARNING_DAYS = 14;
const SESSION_COOKIE = /sess|sid$|^sid|auth|token|login|jwt|csrf|xsrf/iu;

function security(evidence: ScanEvidence): SecurityEvidence | undefined {
  const s = evidence.audit?.security;
  return s?.status !== undefined ? s : undefined;
}

function isHttps(s: SecurityEvidence): boolean {
  return s.finalUrl.startsWith('https:');
}

export const secNoHttps: Rule = {
  id: 'SEC-NO-HTTPS',
  version: '1.0.0',
  category: 'security',
  jurisdictions: ['IL', 'EU'],
  evaluate(evidence) {
    const s = security(evidence);
    if (!s) return [];
    if (!isHttps(s)) {
      return [
        finding(this, {
          severity: 'high',
          title: 'האתר אינו מוגש ב-HTTPS',
          description: 'התקשורת בין המשתמש לאתר אינה מוצפנת, כולל עוגיות ומידע שמוקלד בטפסים.',
          recommendation:
            "התקינו תעודת TLS (למשל Let's Encrypt), הפנו את כל התעבורה ל-HTTPS והפעילו HSTS.",
          references: [REFS.ilSecurityRegs, REFS.gdprArt32],
          evidence: [{ summary: s.finalUrl, refs: ['audit.security.finalUrl'] }],
        }),
      ];
    }
    if (s.httpRedirectsToHttps === false) {
      return [
        finding(this, {
          severity: 'medium',
          title: 'גרסת ה-HTTP של האתר אינה מפנה ל-HTTPS',
          description:
            'כניסה לכתובת http:// נשארת לא מוצפנת במקום להיות מופנית אוטומטית ל-https://.',
          recommendation: 'הגדירו הפניה קבועה (301) מכל כתובות http:// ל-https://.',
          references: [REFS.ilSecurityRegs, REFS.gdprArt32],
          evidence: [
            {
              summary: 'http:// לא הופנה ל-https://',
              refs: ['audit.security.httpRedirectsToHttps'],
            },
          ],
        }),
      ];
    }
    return [];
  },
};

export const secTls: Rule = {
  id: 'SEC-TLS',
  version: '1.0.0',
  category: 'security',
  jurisdictions: ['IL', 'EU'],
  evaluate(evidence) {
    const s = security(evidence);
    if (!s?.tls) return [];
    const out = [];
    if (/^TLS 1\.[01]$|^SSL/iu.test(s.tls.protocol)) {
      out.push(
        finding(this, {
          severity: 'high',
          title: `האתר משתמש בפרוטוקול הצפנה מיושן (${s.tls.protocol})`,
          description: 'גרסאות TLS 1.0/1.1 אינן נחשבות מאובטחות.',
          recommendation: 'אפשרו TLS 1.2 ו-TLS 1.3 בלבד בשרת או ב-CDN.',
          references: [REFS.ilSecurityRegs, REFS.gdprArt32],
          evidence: [{ summary: s.tls.protocol, refs: ['audit.security.tls'] }],
        }),
      );
    }
    const capturedAt = evidence.audit?.capturedAt;
    if (s.tls.validTo !== undefined && capturedAt !== undefined) {
      // Relative to capture time, so re-evaluating old evidence gives the same result.
      const days = Math.floor((s.tls.validTo - capturedAt) / 86_400);
      if (days < CERT_WARNING_DAYS) {
        out.push(
          finding(this, {
            severity: days < 0 ? 'high' : 'medium',
            title:
              days < 0 ? 'תעודת ה-TLS של האתר פגה' : `תעודת ה-TLS של האתר תפוג בעוד ${days} ימים`,
            description: 'תעודה שפגה גורמת לאזהרות אבטחה בדפדפן ולחשיפה לתקיפות יירוט.',
            recommendation: 'חדשו את התעודה והגדירו חידוש אוטומטי.',
            references: [REFS.ilSecurityRegs],
            evidence: [
              {
                summary: `בתוקף עד ${new Date(s.tls.validTo * 1000).toISOString().slice(0, 10)}`,
                refs: ['audit.security.tls'],
              },
            ],
          }),
        );
      }
    }
    return out;
  },
};

export const secHsts: Rule = {
  id: 'SEC-HSTS',
  version: '1.0.0',
  category: 'security',
  jurisdictions: ['IL', 'EU'],
  evaluate(evidence) {
    const s = security(evidence);
    if (!s || !isHttps(s)) return [];
    const value = s.headers['strict-transport-security'];
    const maxAge = Number(/max-age\s*=\s*"?(\d+)/iu.exec(value ?? '')?.[1] ?? NaN);
    if (value !== undefined && maxAge >= MIN_HSTS_SECONDS) return [];
    return [
      finding(this, {
        severity: 'low',
        title: value === undefined ? 'חסרה כותרת HSTS' : 'כותרת HSTS עם תוקף קצר',
        description:
          'HSTS מורה לדפדפן להתחבר לאתר רק ב-HTTPS ומונע התקפות "הורדת הצפנה" (SSL stripping).',
        recommendation: 'הוסיפו: Strict-Transport-Security: max-age=31536000; includeSubDomains',
        references: [REFS.owaspHeaders, REFS.ilSecurityRegs],
        evidence: [{ summary: value ?? 'לא קיימת', refs: ['audit.security.headers'] }],
      }),
    ];
  },
};

export const secHeaders: Rule = {
  id: 'SEC-HEADERS',
  version: '1.0.0',
  category: 'security',
  jurisdictions: ['IL', 'EU'],
  evaluate(evidence) {
    const s = security(evidence);
    if (!s) return [];
    const h = s.headers;
    const csp = h['content-security-policy'] ?? '';
    const missing: string[] = [];
    if (!csp) missing.push('Content-Security-Policy');
    if ((h['x-content-type-options'] ?? '').toLowerCase() !== 'nosniff')
      missing.push('X-Content-Type-Options: nosniff');
    if (!h['x-frame-options'] && !/frame-ancestors/iu.test(csp)) {
      missing.push('X-Frame-Options / CSP frame-ancestors (הגנה מ-Clickjacking)');
    }
    if (!h['referrer-policy']) missing.push('Referrer-Policy');
    const leaks = (['x-powered-by', 'server'] as const)
      .filter((k) => h[k] !== undefined && /\d/u.test(h[k] ?? ''))
      .map((k) => `${k}: ${h[k] ?? ''}`);
    if (missing.length === 0 && leaks.length === 0) return [];
    return [
      finding(this, {
        severity: 'low',
        title: 'חסרות כותרות אבטחה מומלצות',
        description:
          (missing.length ? `כותרות חסרות: ${missing.join(', ')}. ` : '') +
          (leaks.length ? `השרת חושף גרסאות תוכנה: ${leaks.join(', ')}.` : ''),
        recommendation:
          'הגדירו את הכותרות בשרת/CDN. Referrer-Policy: strict-origin-when-cross-origin מצמצמת דליפת כתובות (העלולות להכיל מידע אישי) לצדדים שלישיים.',
        references: [REFS.owaspHeaders, REFS.ilSecurityRegs],
        evidence: [
          { summary: [...missing, ...leaks].join(' · '), refs: ['audit.security.headers'] },
        ],
      }),
    ];
  },
};

export const secMixedContent: Rule = {
  id: 'SEC-MIXED-CONTENT',
  version: '1.0.0',
  category: 'security',
  jurisdictions: ['IL', 'EU'],
  evaluate(evidence) {
    const refs: string[] = [];
    const items = new Set<string>();
    const base = evidence.modes.baseline;
    if (base?.finalUrl.startsWith('https:')) {
      base.requests.forEach((r, i) => {
        if (r.origin.startsWith('http:')) {
          refs.push(`baseline.requests[${i}]`);
          items.add(r.origin + r.path);
        }
      });
    }
    evidence.audit?.pages.forEach((p, i) => {
      if (!p.finalUrl.startsWith('https:') || !p.insecureResources?.length) return;
      refs.push(`audit.pages[${i}].insecureResources`);
      for (const r of p.insecureResources) items.add(r);
    });
    if (items.size === 0) return [];
    return [
      finding(this, {
        severity: 'medium',
        title: 'דף מאובטח מפנה למשאבים בחיבור לא מוצפן (Mixed Content)',
        description: `נמצאו ${items.size} משאבים בכתובת http:// בתוך דפי https:// (${[...items].slice(0, 3).join(', ')}).`,
        recommendation:
          'החליפו את כל כתובות המשאבים ל-https:// והוסיפו CSP upgrade-insecure-requests.',
        references: [REFS.ilSecurityRegs, REFS.gdprArt32],
        evidence: [{ summary: [...items].slice(0, 5).join(', '), refs: refs.slice(0, 20) }],
      }),
    ];
  },
};

export const secCookieFlags: Rule = {
  id: 'SEC-COOKIE-FLAGS',
  version: '1.0.0',
  category: 'security',
  jurisdictions: ['IL', 'EU'],
  evaluate(evidence) {
    const base = evidence.modes.baseline;
    if (!base?.finalUrl.startsWith('https:')) return [];
    const notSecure = new Set<string>();
    const notHttpOnly = new Set<string>();
    const refs: string[] = [];
    base.cookies.forEach((c, i) => {
      if (c.thirdParty) return;
      let flagged = false;
      if (!c.secure) {
        notSecure.add(c.name);
        flagged = true;
      }
      const sessionLike = SESSION_COOKIE.test(c.name) || c.tracker?.entryId === 'session-generic';
      if (sessionLike && !c.httpOnly && !/csrf|xsrf/iu.test(c.name)) {
        notHttpOnly.add(c.name);
        flagged = true;
      }
      if (flagged) refs.push(`baseline.cookies[${i}]`);
    });
    if (refs.length === 0) return [];
    return [
      finding(this, {
        severity: notHttpOnly.size > 0 ? 'medium' : 'low',
        title: 'עוגיות של האתר ללא דגלי אבטחה',
        description:
          (notSecure.size ? `ללא Secure: ${[...notSecure].slice(0, 10).join(', ')}. ` : '') +
          (notHttpOnly.size
            ? `עוגיות שנראות כעוגיות זיהוי/סשן ללא HttpOnly: ${[...notHttpOnly].join(', ')}.`
            : ''),
        recommendation:
          'הגדירו Secure לכל העוגיות באתר HTTPS, ו-HttpOnly + SameSite לעוגיות סשן והתחברות.',
        references: [REFS.owaspHeaders, REFS.ilSecurityRegs],
        evidence: [
          {
            mode: 'baseline',
            summary: [...new Set([...notSecure, ...notHttpOnly])].slice(0, 10).join(', '),
            refs: refs.slice(0, 20),
          },
        ],
      }),
    ];
  },
};

export const SECURITY_RULES: Rule[] = [
  secNoHttps,
  secTls,
  secHsts,
  secHeaders,
  secMixedContent,
  secCookieFlags,
];
