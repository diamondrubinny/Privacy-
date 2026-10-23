import type { Jurisdiction } from '@privacyscan/shared';

export type PolicyElementId =
  | 'controllerIdentity'
  | 'contact'
  | 'purposes'
  | 'dataCollected'
  | 'thirdParties'
  | 'rights'
  | 'legalObligation'
  | 'transferAbroad'
  | 'retention'
  | 'security'
  | 'cookies'
  | 'lastUpdated'
  | 'legalBasis'
  | 'complaint'
  | 'dpo';

export interface PolicyElement {
  id: PolicyElementId;
  label: string;
  /** core = expected by the notice duty; recommended = good practice; info = reported only. */
  level: 'core' | 'recommended' | 'info';
  jurisdictions: Jurisdiction[];
  pattern?: RegExp;
}

/**
 * Keyword heuristics (Hebrew + English). "Not found" means the wording was not detected,
 * not that the policy lacks the content — findings say so explicitly.
 */
export const POLICY_ELEMENTS: PolicyElement[] = [
  {
    id: 'controllerIdentity',
    label: 'זהות בעל המאגר / מפעיל האתר',
    level: 'core',
    jurisdictions: ['IL', 'EU'],
    pattern:
      /ח\.?\s?פ\.?|ע\.?\s?מ\.?|עוסק\s*מורשה|בע"מ|בעל(ת)?\s*(ה)?מאגר|מפעיל(ת)?\s*(ה)?אתר|בעל(ת)?\s*(ה)?אתר|company|controller|ltd\.?|inc\./iu,
  },
  {
    id: 'contact',
    label: 'דרך יצירת קשר בנושאי פרטיות',
    level: 'core',
    jurisdictions: ['IL', 'EU'],
    pattern:
      /[\w.+-]+@[\w-]+\.[\w.-]+|צור\s*קשר|ליצור\s*קשר|לפנות\s*אלינו|ניתן\s*לפנות|contact\s*us|contact/iu,
  },
  {
    id: 'purposes',
    label: 'מטרות השימוש במידע',
    level: 'core',
    jurisdictions: ['IL', 'EU'],
    pattern: /מטר(ה|ות|ת)|לצורך|לשם\s|נשתמש|ישמש|ישמשו|purpose|we\s*use\s*(your|the)/iu,
  },
  {
    id: 'dataCollected',
    label: 'סוגי המידע הנאסף',
    level: 'core',
    jurisdictions: ['IL', 'EU'],
    pattern:
      /המידע\s*(ש)?(נאסף|אנו\s*אוספים)|סוגי\s*(ה)?מידע|נאסוף|אנו\s*אוספים|מידע\s*אישי|information\s*we\s*collect|personal\s*(data|information)\s*we/iu,
  },
  {
    id: 'thirdParties',
    label: 'העברה לצדדים שלישיים / ספקים',
    level: 'core',
    jurisdictions: ['IL', 'EU'],
    pattern:
      /צד(דים)?\s*שלישי|ספקים|נותני\s*שירות|נעביר|מסירת\s*(ה)?מידע|העברת\s*(ה)?מידע|third[\s-]*part|service\s*providers|share\s*(your|personal)/iu,
  },
  {
    id: 'rights',
    label: 'זכות עיון, תיקון ומחיקה',
    level: 'core',
    jurisdictions: ['IL', 'EU'],
    pattern:
      /זכות(ך)?\s*(ל)?עיון|לעיין\s*במידע|עיון\s*במידע|לתקן|תיקון\s*(ה)?מידע|למחוק|מחיקת\s*(ה)?מידע|right(s)?\s*(to|of)\s*(access|rectif|eras|delet)|request\s*access/iu,
  },
  {
    id: 'legalObligation',
    label: 'האם חלה חובה חוקית למסור את המידע',
    level: 'core',
    jurisdictions: ['IL'],
    pattern:
      /חובה\s*חוקית|אינ(ך|כם)\s*(מחויב|חייב)|אין\s*(ל[ךו]\s*|עליך\s*)?חובה|לא\s*חלה\s*(עליך\s*)?חובה|מרצונ(ך|כם)\s*(ה)?חופשי|not\s*(legally\s*)?(required|obligated|obliged)/iu,
  },
  {
    id: 'transferAbroad',
    label: 'העברת מידע מחוץ לישראל',
    level: 'recommended',
    jurisdictions: ['IL', 'EU'],
    pattern:
      /מחוץ\s*ל(מדינת\s*)?ישראל|לחו"?ל|חוץ\s*לארץ|מדינות\s*אחרות|outside\s*(of\s*)?(israel|the\s*eea|the\s*eu)|abroad|international\s*transfer|other\s*countries/iu,
  },
  {
    id: 'retention',
    label: 'תקופת שמירת המידע',
    level: 'recommended',
    jurisdictions: ['IL', 'EU'],
    pattern:
      /תקופת\s*(ה)?שמירה|נשמור\s*את|יישמר|ישמר\s*(למשך|עד|לתקופה)|שמירת\s*(ה)?מידע|retention|retain|stored\s*for|keep\s*your/iu,
  },
  {
    id: 'security',
    label: 'אבטחת מידע',
    level: 'recommended',
    jurisdictions: ['IL', 'EU'],
    pattern: /אבטחת\s*(ה)?מידע|אמצעי\s*אבטחה|הצפנה|מוצפן|security\s*measures|secure|encrypt/iu,
  },
  {
    id: 'cookies',
    label: 'שימוש בעוגיות וכלי מעקב',
    level: 'recommended',
    jurisdictions: ['IL', 'EU'],
    pattern: /עוגיות|cookies?|קוקיז|פיקסל|pixel/iu,
  },
  {
    id: 'lastUpdated',
    label: 'תאריך עדכון אחרון',
    level: 'recommended',
    jurisdictions: ['IL', 'EU'],
  },
  {
    id: 'legalBasis',
    label: 'בסיס חוקי לעיבוד (GDPR)',
    level: 'recommended',
    jurisdictions: ['EU'],
    pattern:
      /בסיס\s*(ה)?(חוקי|משפטי)|legal\s*basis|lawful\s*basis|legitimate\s*interest|אינטרס\s*לגיטימי/iu,
  },
  {
    id: 'complaint',
    label: 'זכות תלונה לרשות פיקוח',
    level: 'recommended',
    jurisdictions: ['EU'],
    pattern:
      /הרשות\s*להגנת\s*(ה)?פרטיות|supervisory\s*authority|lodge\s*a\s*complaint|data\s*protection\s*authority|להגיש\s*תלונה/iu,
  },
  {
    id: 'dpo',
    label: 'ממונה הגנת פרטיות (אם חלה חובת מינוי)',
    level: 'info',
    jurisdictions: ['IL', 'EU'],
    pattern: /ממונה\s*(על\s*)?הגנת\s*(ה)?פרטיות|data\s*protection\s*officer|\bDPO\b/iu,
  },
];

const HE_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ|מרס',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];
const EN_MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

/**
 * Explicit "last updated" wording only. Generic phrases like "בתוקף מ..." are excluded: policies
 * often quote when a law took effect, which is not the policy's own update date.
 */
const UPDATED_KEYWORD =
  /עודכן\s*לאחרונה|עדכון\s*אחרון|תאריך\s*(ה)?עדכון|עודכנה\s*לאחרונה|עודכן\s*בתאריך|last\s*(updated|modified|revised)|effective\s*date|updated\s*(on|:)/giu;

function iso(y: number, m: number, d: number): string | null {
  const year = y < 100 ? 2000 + y : y;
  if (year < 1990 || year > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function monthIndex(word: string): number {
  const w = word.replace(/^ב/, '').toLowerCase();
  const he = HE_MONTHS.findIndex((m) => new RegExp(`^(${m})$`, 'u').test(w));
  if (he >= 0) return he + 1;
  const en = EN_MONTHS.findIndex((m) => w.startsWith(m));
  return en >= 0 ? en + 1 : 0;
}

/** Parses the first date in a short window. Numeric dates are read as day/month (Israeli format). */
export function parseDate(window: string): string | null {
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(window);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/.exec(window);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    // dd/mm unless that is impossible (then mm/dd).
    return a > 12 || b <= 12 ? iso(Number(m[3]), b, a) : iso(Number(m[3]), a, b);
  }
  m = /(?:(\d{1,2})\s*)?(ב?[֐-׿]{3,8}|[A-Za-z]{3,9})\.?\s*(\d{1,2})?,?\s*(\d{4})/u.exec(window);
  if (m?.[2] && m[4]) {
    const month = monthIndex(m[2]);
    if (month) return iso(Number(m[4]), month, Number(m[1] ?? m[3] ?? 1));
  }
  return null;
}

/** Finds an explicit "last updated" date in the policy text. */
export function findLastUpdated(text: string): string | null {
  for (const match of text.matchAll(UPDATED_KEYWORD)) {
    const start = match.index + match[0].length;
    const date = parseDate(text.slice(start, start + 60));
    if (date) return date;
  }
  return null;
}

export function hebrewRatio(text: string): number | null {
  const he = (text.match(/[֐-׿]/gu) ?? []).length;
  const la = (text.match(/[A-Za-z]/g) ?? []).length;
  return he + la === 0 ? null : he / (he + la);
}

export function detectElements(text: string): Map<PolicyElementId, boolean> {
  const found = new Map<PolicyElementId, boolean>();
  for (const el of POLICY_ELEMENTS) {
    found.set(
      el.id,
      el.id === 'lastUpdated' ? findLastUpdated(text) !== null : (el.pattern?.test(text) ?? false),
    );
  }
  return found;
}
