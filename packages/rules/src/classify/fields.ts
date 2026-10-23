import type { FormCheckboxEvidence, FormEvidence, FormFieldEvidence } from '@privacyscan/shared';

export type FieldKind =
  | 'email'
  | 'phone'
  | 'name'
  | 'address'
  | 'idNumber'
  | 'birthDate'
  | 'health'
  | 'specialCategory'
  | 'financial'
  | 'password'
  | 'file'
  | 'freeText'
  | 'search'
  | 'other';

/** Special categories ("מידע בעל רגישות מיוחדת"): definition requires legal verification. */
export const SPECIAL_KINDS: ReadonlySet<FieldKind> = new Set(['health', 'specialCategory']);
export const IDENTIFIER_KINDS: ReadonlySet<FieldKind> = new Set([
  'idNumber',
  'financial',
  'birthDate',
]);
export const PERSONAL_KINDS: ReadonlySet<FieldKind> = new Set([
  'email',
  'phone',
  'name',
  'address',
  'idNumber',
  'birthDate',
  'health',
  'specialCategory',
  'financial',
  'file',
]);

export const FIELD_LABELS_HE: Record<FieldKind, string> = {
  email: 'דוא"ל',
  phone: 'טלפון',
  name: 'שם',
  address: 'כתובת',
  idNumber: 'מספר זהות / דרכון',
  birthDate: 'תאריך לידה / גיל',
  health: 'מידע רפואי',
  specialCategory: "מידע רגיש (דת, מוצא, נטייה, עבר פלילי וכד')",
  financial: 'מידע פיננסי / אשראי',
  password: 'סיסמה',
  file: 'העלאת קובץ',
  freeText: 'טקסט חופשי',
  search: 'חיפוש',
  other: 'אחר',
};

// Order matters: the first match wins (most specific/sensitive first).
// Note: \b is ASCII-only in JS regexes, so Hebrew word boundaries use explicit lookarounds.
const PATTERNS: [FieldKind, RegExp][] = [
  // Not about a person (domain search, coupons, quantities) — checked first to avoid "שם דומיין" → name.
  [
    'other',
    /domain|דומיין|\burl\b|website|כתובת\s*(ה)?אתר|coupon|קופון|promo|quantity|כמות|captcha/iu,
  ],
  [
    'health',
    /health|medical|diagnos|illness|disease|medicat|allerg|pregnan|disabilit|בריאות|רפוא|מחל[הות]|אבחנ|תרופ|אלרגי|הריון|מוגבלות|נכות|טיפול רפואי/iu,
  ],
  [
    'specialCategory',
    /religio|ethnic|sexual|orientation|political|criminal|biometric|fingerprint|(?<![\u0590-\u05FF])דת(י|ית)?(?![\u0590-\u05FF])|מוצא|נטי[יה]ה מינית|השקפ|פוליטי|פליל|ביומטר|טביעת אצבע/iu,
  ],
  [
    'idNumber',
    /תעודת\s*זהות|ת\.?\s?ז(?![\u0590-\u05FF])|ת"ז|מספר\s*זהות|id[\s_-]?(number|no)|national[\s_-]?id|teudat|passport|דרכון/iu,
  ],
  [
    'financial',
    /cc-|card[\s_-]?(number|no)|credit|cvv|cvc|iban|bank|account[\s_-]?(number|no)|כרטיס\s*אשראי|אשראי|חשבון\s*בנק|מספר\s*חשבון|סניף|קוד\s*אבטחה/iu,
  ],
  [
    'birthDate',
    /bday|birth|dob\b|date[\s_-]?of[\s_-]?birth|תאריך\s*לידה|(?<![\u0590-\u05FF])גיל(?![\u0590-\u05FF])|^age\b|\bage\b/iu,
  ],
  ['email', /e-?mail|דוא"?ל|אימייל|מייל|דואר\s*אלקטרוני/iu],
  ['phone', /phone|mobile|\btel\b|cell|טלפון|נייד|פלאפון|סלולר/iu],
  ['address', /street-address|address|street|city|zip|postal|כתובת|רחוב|עיר|ישוב|יישוב|מיקוד/iu],
  [
    'name',
    /given-name|family-name|\bname\b|first[\s_-]?name|last[\s_-]?name|full[\s_-]?name|fname|lname|שם/iu,
  ],
  ['search', /search|חיפוש|^q$|^s$/iu],
];

export function classifyField(field: FormFieldEvidence): FieldKind {
  const type = field.type.toLowerCase();
  if (type === 'password') return 'password';
  if (type === 'file') return 'file';
  if (type === 'search') return 'search';
  const hints = `${field.hints} ${field.autocomplete}`;
  // Sensitive patterns first so that e.g. "פרטים רפואיים" in a textarea is not just free text.
  for (const [kind, re] of PATTERNS) {
    if (re.test(hints)) return kind;
  }
  if (type === 'email') return 'email';
  if (type === 'tel') return 'phone';
  if (field.tag === 'textarea') return 'freeText';
  return 'other';
}

export type FormPurpose = 'search' | 'login' | 'collect';

const PASSWORD_RESET = /(שכחת|איפוס|שחזור)\s*(את\s*)?(ה)?סיסמה|forgot|reset\s*(your\s*)?password/iu;

export interface ClassifiedForm {
  form: FormEvidence;
  kinds: FieldKind[];
  purpose: FormPurpose;
  personal: boolean;
}

export function classifyForm(form: FormEvidence): ClassifiedForm {
  const kinds = form.fields.map(classifyField);
  const set = new Set(kinds);
  let purpose: FormPurpose = 'collect';
  if (
    kinds.length > 0 &&
    kinds.every((k) => k === 'search' || k === 'other') &&
    set.has('search')
  ) {
    purpose = 'search';
  } else if (
    set.has('password') &&
    kinds.every((k) => k === 'password' || k === 'email' || k === 'name' || k === 'other') &&
    kinds.length <= 3
  ) {
    purpose = 'login';
  } else if (
    kinds.every((k) => k === 'email' || k === 'other') &&
    PASSWORD_RESET.test(form.contextText)
  ) {
    // Password reset on an existing account, not a new collection of personal data.
    purpose = 'login';
  }
  return {
    form,
    kinds,
    purpose,
    personal: purpose === 'collect' && kinds.some((k) => PERSONAL_KINDS.has(k)),
  };
}

const MARKETING =
  /דיוור|ניוזלטר|newsletter|עדכונים|מבצעים|הטבות|פרסומ|שיווק|marketing|promotion|special offers|offers|mailing|דברי\s*פרסומת/iu;
const TERMS_OR_PRIVACY = /תקנון|תנאי(ם)?\s*(ה)?שימוש|מדיניות|terms|privacy|פרטיות/iu;

export function isMarketingConsent(cb: FormCheckboxEvidence): boolean {
  return MARKETING.test(cb.label);
}

export function isBundledWithTerms(cb: FormCheckboxEvidence): boolean {
  return MARKETING.test(cb.label) && TERMS_OR_PRIVACY.test(cb.label);
}

/** Stable key to report a form once when it repeats across pages (e.g. footer newsletter). */
export function formSignature(c: ClassifiedForm): string {
  const action = c.form.action ? `${c.form.action.origin}${c.form.action.path}` : '-';
  return `${action}|${[...c.kinds].sort().join(',')}|${c.form.checkboxes
    .map((x) => x.label)
    .sort()
    .join('|')}`;
}
