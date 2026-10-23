import {
  CONSENT_REQUIRED_CATEGORIES,
  type BrowserMode,
  type Finding,
  type Rule,
  type CookieRecord,
  type ModeEvidence,
  type RequestRecord,
  type ScanEvidence,
} from '@privacyscan/shared';

export const REFS = {
  gdprConsent: 'GDPR סעיפים 4(11), 6(1)(a), 7 — תנאי הסכמה',
  ePrivacy: 'ePrivacy Directive 2002/58/EC סעיף 5(3) — אחסון/גישה למידע במכשיר המשתמש',
  edpbTaskforce: 'EDPB Cookie Banner Taskforce Report (ינואר 2023)',
  edpbDarkPatterns: 'EDPB Guidelines 03/2022 — Deceptive design patterns',
  cjeuPlanet49: 'פסק דין Planet49 (CJEU C-673/17) — תיבות מסומנות מראש אינן הסכמה',
  gdprWithdraw: 'GDPR סעיף 7(3) — משיכת הסכמה קלה כמו מתן הסכמה',
  ilNotice:
    'חוק הגנת הפרטיות, התשמ"א-1981 (כולל תיקון 13) — חובת יידוע ועקרון צמידות המטרה; תחולה על עוגיות דורשת בדיקה משפטית',
  cnilRetention: 'CNIL — הנחיות עוגיות (2020): תוקף מומלץ עד 13 חודשים',
  ilSection11: 'חוק הגנת הפרטיות, התשמ"א-1981, סעיף 11 — חובת יידוע בעת בקשת מידע',
  ilAmendment13: 'תיקון 13 לחוק הגנת הפרטיות (בתוקף מ-14.08.2025 — דורש אימות)',
  ilSensitive: 'תיקון 13 — "מידע בעל רגישות מיוחדת" (רשימת הקטגוריות דורשת אימות מול נוסח החוק)',
  ilSecurityRegs: 'תקנות הגנת הפרטיות (אבטחת מידע), התשע"ז-2017',
  ilTransferRegs: 'תקנות הגנת הפרטיות (העברת מידע אל מאגרי מידע שמחוץ לגבולות המדינה), התשס"א-2001',
  spamLaw: 'חוק התקשורת (בזק ושידורים), התשמ"ב-1982, סעיף 30א — הסכמה מפורשת לדברי פרסומת',
  gdprArt13: 'GDPR סעיף 13 — מידע שיש למסור בעת איסוף',
  gdprArt28: 'GDPR סעיף 28 — מעבד מידע (DPA)',
  gdprArt32: 'GDPR סעיף 32 — אבטחת העיבוד',
  gdprArt9: 'GDPR סעיף 9 — קטגוריות מיוחדות של מידע',
  ilA11yRegs:
    'תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג-2013, תקנה 35 — חלות ופטורים דורשים בדיקה',
  is5568: 'ת"י 5568 (מבוסס WCAG; הגרסה המחייבת דורשת אימות)',
  wcag21: 'WCAG 2.1 רמה AA',
  owaspHeaders: 'OWASP Secure Headers Project',
} as const;

/** Amendment 13 effective date (requires verification against the official publication). */
export const AMENDMENT_13_EFFECTIVE = '2025-08-14';

/** `ruleId` may be refined (e.g. "A11Y-AXE-image-alt") but must keep the rule id as prefix. */
type FindingFields = Omit<Finding, 'ruleId' | 'ruleVersion' | 'category' | 'jurisdictions'> &
  Partial<Pick<Finding, 'jurisdictions' | 'ruleId'>>;

/** Fills rule metadata so each rule only states what it found. */
export function finding(rule: Rule, fields: FindingFields): Finding {
  if (fields.ruleId !== undefined && !fields.ruleId.startsWith(`${rule.id}-`)) {
    throw new Error(`Finding id ${fields.ruleId} must extend ${rule.id}`);
  }
  return {
    ...fields,
    ruleId: fields.ruleId ?? rule.id,
    ruleVersion: rule.version,
    category: rule.category,
    jurisdictions: fields.jurisdictions ?? rule.jurisdictions,
  };
}

export interface Offender {
  vendor: string;
  lowRisk: boolean;
  requests: { ref: string; record: RequestRecord }[];
  cookies: { ref: string; record: CookieRecord }[];
}

export function needsConsent(record: RequestRecord | CookieRecord): boolean {
  return record.tracker !== undefined && CONSENT_REQUIRED_CATEGORIES.has(record.tracker.category);
}

/** Groups consent-requiring trackers by vendor, keeping evidence references. */
export function groupOffenders(
  mode: ModeEvidence,
  filter: {
    request: (r: RequestRecord) => boolean;
    cookie: (c: CookieRecord) => boolean;
  },
): Offender[] {
  const byVendor = new Map<string, Offender>();
  const get = (vendor: string, lowRisk: boolean): Offender => {
    let o = byVendor.get(vendor);
    if (!o) {
      o = { vendor, lowRisk, requests: [], cookies: [] };
      byVendor.set(vendor, o);
    }
    o.lowRisk &&= lowRisk;
    return o;
  };
  mode.requests.forEach((record, i) => {
    if (!record.tracker || !needsConsent(record) || !filter.request(record)) return;
    get(record.tracker.vendor, record.tracker.lowRisk ?? false).requests.push({
      ref: `${mode.mode}.requests[${i}]`,
      record,
    });
  });
  mode.cookies.forEach((record, i) => {
    if (!record.tracker || !needsConsent(record) || !filter.cookie(record)) return;
    get(record.tracker.vendor, record.tracker.lowRisk ?? false).cookies.push({
      ref: `${mode.mode}.cookies[${i}]`,
      record,
    });
  });
  return [...byVendor.values()].sort((a, b) => a.vendor.localeCompare(b.vendor));
}

/**
 * Google Consent Mode "denied" pings (gcs=G100) without cookies: data still leaves the
 * browser, but storage is denied. Reported with reduced severity and an explanation.
 */
export function isConsentModeDeniedOnly(o: Offender): boolean {
  return (
    o.cookies.length === 0 &&
    o.requests.length > 0 &&
    o.requests.every((r) => r.record.consentSignal === 'G100')
  );
}

export function summarize(o: Offender): string {
  const hosts = [...new Set(o.requests.map((r) => r.record.hostname))].slice(0, 5);
  const cookies = [...new Set(o.cookies.map((c) => c.record.name))].slice(0, 5);
  const parts: string[] = [];
  if (hosts.length) parts.push(`בקשות ל: ${hosts.join(', ')}`);
  if (cookies.length) parts.push(`עוגיות: ${cookies.join(', ')}`);
  return parts.join(' · ');
}

export function refsOf(o: Offender, limit = 20): string[] {
  return [...o.requests.map((r) => r.ref), ...o.cookies.map((c) => c.ref)].slice(0, limit);
}

/**
 * The observations representing "before any consent": the baseline mode, or otherwise the
 * pre-action phase of another mode. Returned as mode + phase filter so evidence indices stay valid.
 */
export function preConsentView(
  evidence: ScanEvidence,
): { mode: ModeEvidence; preActionOnly: boolean } | undefined {
  if (evidence.modes.baseline) return { mode: evidence.modes.baseline, preActionOnly: false };
  const other = evidence.modes.reject ?? evidence.modes.accept;
  return other ? { mode: other, preActionOnly: true } : undefined;
}

export function anyBanner(evidence: ScanEvidence): ModeEvidence | undefined {
  const order: BrowserMode[] = ['baseline', 'reject', 'accept'];
  return order.map((m) => evidence.modes[m]).find((m) => m?.banner.found);
}

export function hasConsentTrackers(evidence: ScanEvidence): boolean {
  return Object.values(evidence.modes).some(
    (m) => m.requests.some(needsConsent) || m.cookies.some(needsConsent),
  );
}
