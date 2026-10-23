import type { AuditedPage, Rule, ScanEvidence } from '@privacyscan/shared';
import {
  detectElements,
  findLastUpdated,
  hebrewRatio,
  POLICY_ELEMENTS,
  type PolicyElement,
} from '../classify/policy.js';
import { AMENDMENT_13_EFFECTIVE, finding, REFS } from '../helpers.js';

const MIN_POLICY_CHARS = 1_500;

function home(evidence: ScanEvidence): AuditedPage | undefined {
  return evidence.audit?.pages.find((p) => p.role === 'home');
}

/** The audit reached the home page, so absence of a link is meaningful. */
function homeLoaded(evidence: ScanEvidence): boolean {
  const h = home(evidence);
  return h !== undefined && h.error === undefined && (h.status ?? 0) < 400;
}

function readablePolicy(evidence: ScanEvidence): string | undefined {
  const p = evidence.audit?.policy;
  if (!p || p.error || (p.status ?? 200) >= 400 || p.text.length === 0) return undefined;
  return p.text;
}

export const polMissing: Rule = {
  id: 'POL-MISSING',
  version: '1.0.0',
  category: 'policy',
  jurisdictions: ['IL', 'EU'],
  evaluate(evidence) {
    if (!homeLoaded(evidence) || evidence.audit?.legalLinks.privacy) return [];
    return [
      finding(this, {
        severity: 'high',
        title: 'לא נמצא קישור למדיניות פרטיות',
        description:
          'בדף הבית לא זוהה קישור למדיניות פרטיות. אתר שאוסף מידע אישי (טפסים, עוגיות, אנליטיקה) נדרש ליידע את המשתמשים ' +
          'על מטרות האיסוף, הנמענים וזכויותיהם. ייתכן שהקישור קיים בתפריט שלא זוהה — מומלץ לאמת.',
        recommendation:
          'פרסמו מדיניות פרטיות בעברית, וקשרו אליה מה-Footer בכל דף ומכל טופס שאוסף מידע אישי.',
        references: [REFS.ilSection11, REFS.gdprArt13],
        evidence: [{ summary: 'לא זוהה קישור מתאים בדף הבית', refs: ['audit.legalLinks'] }],
      }),
    ];
  },
};

export const polUnreachable: Rule = {
  id: 'POL-UNREACHABLE',
  version: '1.0.0',
  category: 'policy',
  jurisdictions: ['IL', 'EU'],
  evaluate(evidence) {
    const p = evidence.audit?.policy;
    if (!p) return [];
    const broken = p.error !== undefined || (p.status ?? 200) >= 400 || p.text.trim().length === 0;
    if (!broken) return [];
    return [
      finding(this, {
        severity: 'medium',
        title: 'קישור מדיניות הפרטיות שבור או ריק',
        description: 'נמצא קישור למדיניות פרטיות, אבל הדף לא נטען או שאין בו תוכן.',
        recommendation: 'ודאו שהקישור מוביל לדף פעיל עם נוסח המדיניות המלא.',
        references: [REFS.ilSection11],
        evidence: [
          {
            summary: `${p.url} — ${p.error ?? `HTTP ${p.status ?? '?'}`}`,
            refs: ['audit.policy'],
          },
        ],
      }),
    ];
  },
};

export const polNotHebrew: Rule = {
  id: 'POL-NOT-HEBREW',
  version: '1.0.0',
  category: 'policy',
  jurisdictions: ['IL'],
  evaluate(evidence) {
    const text = readablePolicy(evidence);
    const h = home(evidence);
    if (!text || !h) return [];
    const siteIsHebrew =
      (h.lang ?? '').toLowerCase().startsWith('he') || (h.hebrewRatio ?? 0) > 0.3;
    const ratio = hebrewRatio(text);
    if (!siteIsHebrew || ratio === null || ratio >= 0.2) return [];
    return [
      finding(this, {
        severity: 'medium',
        title: 'האתר בעברית אך מדיניות הפרטיות אינה בעברית',
        description:
          'יידוע אפקטיבי מחייב שפה שהמשתמשים מבינים. מדיניות באנגלית בלבד באתר המיועד לקהל ישראלי עלולה שלא לעמוד בחובת היידוע.',
        recommendation: 'פרסמו נוסח עברי מלא של המדיניות (ובמידת הצורך גם בשפות נוספות).',
        references: [REFS.ilSection11],
        evidence: [
          {
            summary: `שיעור אותיות עבריות במדיניות: ${Math.round(ratio * 100)}%`,
            refs: ['audit.policy.text'],
          },
        ],
      }),
    ];
  },
};

function names(elements: PolicyElement[]): string {
  return elements.map((e) => e.label).join('; ');
}

export const polElementsMissing: Rule = {
  id: 'POL-ELEMENTS-MISSING',
  version: '1.0.0',
  category: 'policy',
  jurisdictions: ['IL', 'EU'],
  evaluate(evidence) {
    const text = readablePolicy(evidence);
    if (!text) return [];
    const found = detectElements(text);
    const missing = POLICY_ELEMENTS.filter((e) => e.level !== 'info' && found.get(e.id) === false);
    const core = missing.filter((e) => e.level === 'core');
    const recommended = missing.filter(
      (e) => e.level === 'recommended' && e.jurisdictions.includes('IL'),
    );
    const euOnly = missing.filter((e) => !e.jurisdictions.includes('IL'));
    const short = text.length < MIN_POLICY_CHARS;
    if (core.length === 0 && recommended.length === 0 && euOnly.length === 0 && !short) return [];

    const lines = [
      core.length ? `רכיבי יידוע מרכזיים שלא זוהו: ${names(core)}.` : '',
      recommended.length ? `רכיבים מומלצים שלא זוהו: ${names(recommended)}.` : '',
      euOnly.length ? `לאתרים הפונים לאיחוד האירופי (GDPR) נדרשים גם: ${names(euOnly)}.` : '',
      short ? `המדיניות קצרה מאוד (${text.length} תווים) — ייתכן שאינה מלאה.` : '',
    ].filter(Boolean);
    return [
      finding(this, {
        severity: core.length > 0 ? 'medium' : 'low',
        title: 'במדיניות הפרטיות לא זוהו רכיבים נדרשים',
        description:
          `${lines.join(' ')} ` +
          'הזיהוי מבוסס על ניסוח (מילות מפתח); "לא זוהה" אינו בהכרח "לא קיים" — יש לבדוק את הנוסח המלא מול עו"ד.',
        recommendation:
          'השלימו את הסעיפים החסרים: זהות בעל המאגר ופרטי קשר, סוגי המידע, מטרות, נמענים, האם יש חובה חוקית למסור מידע, ' +
          'זכויות עיון ותיקון, העברה לחו"ל, תקופת שמירה ותאריך עדכון.',
        references: [REFS.ilSection11, REFS.ilAmendment13, REFS.ilTransferRegs, REFS.gdprArt13],
        evidence: [
          {
            summary: `לא זוהו: ${missing.map((e) => e.id).join(', ') || '—'}`,
            refs: ['audit.policy.text'],
          },
        ],
      }),
    ];
  },
};

export const polOutdated: Rule = {
  id: 'POL-OUTDATED',
  version: '1.0.0',
  category: 'policy',
  jurisdictions: ['IL'],
  evaluate(evidence) {
    const text = readablePolicy(evidence);
    if (!text) return [];
    const updated = findLastUpdated(text);
    if (!updated || updated >= AMENDMENT_13_EFFECTIVE) return [];
    return [
      finding(this, {
        severity: 'low',
        title: 'מדיניות הפרטיות עודכנה לפני כניסת תיקון 13 לתוקף',
        description: `תאריך העדכון שזוהה (${updated}) קודם לכניסת תיקון 13 לתוקף. ייתכן שהמדיניות אינה משקפת את הדרישות המעודכנות.`,
        recommendation: 'בחנו את המדיניות מחדש מול דרישות תיקון 13 ועדכנו את התאריך לאחר העדכון.',
        references: [REFS.ilAmendment13],
        evidence: [{ summary: `עודכן לאחרונה: ${updated}`, refs: ['audit.policy.text'] }],
      }),
    ];
  },
};

export const POLICY_RULES: Rule[] = [
  polMissing,
  polUnreachable,
  polNotHebrew,
  polElementsMissing,
  polOutdated,
];
