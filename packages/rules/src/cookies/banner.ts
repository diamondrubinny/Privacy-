import type { Finding, Rule } from '@privacyscan/shared';
import { anyBanner, hasConsentTrackers, REFS } from '../helpers.js';

export const ckNoBanner: Rule = {
  id: 'CK-NO-BANNER',
  version: '1.0.0',
  category: 'cookies',
  jurisdictions: ['EU', 'IL'],
  evaluate(evidence) {
    if (anyBanner(evidence) || !hasConsentTrackers(evidence)) return [];
    return [
      {
        ruleId: this.id,
        ruleVersion: this.version,
        category: this.category,
        severity: 'high',
        jurisdictions: this.jurisdictions,
        title: 'לא נמצא באנר הסכמה לעוגיות, למרות שפועלים כלי מעקב',
        description:
          'באתר פועלים כלי אנליטיקה או שיווק, אך לא זוהה ממשק שמאפשר למשתמש לאשר או לדחות אותם. ' +
          'ייתכן שהבאנר קיים אך לא זוהה (למשל עיצוב לא סטנדרטי), או שהוא מוצג רק למבקרים ממדינות מסוימות ' +
          '(geo-targeting) — מומלץ לאמת ידנית ולבדוק את מיקום הסריקה בדוח.',
        recommendation:
          'הטמיעו מערכת ניהול הסכמה (CMP) עם כפתורי "אישור הכל", "דחיית הכל" ו"ניהול העדפות", ' +
          'וחסמו כלים לא חיוניים עד לקבלת הסכמה.',
        references: [REFS.ePrivacy, REFS.gdprConsent, REFS.ilNotice],
        evidence: [{ summary: 'לא זוהה באנר בשום מצב דפדפן', refs: [] }],
      },
    ];
  },
};

export const ckNoReject: Rule = {
  id: 'CK-NO-REJECT',
  version: '1.0.0',
  category: 'cookies',
  jurisdictions: ['EU', 'IL'],
  evaluate(evidence) {
    const mode = anyBanner(evidence);
    if (!mode) return [];
    const kinds = new Set(mode.banner.buttons.map((b) => b.kind));
    if (!kinds.has('accept') || kinds.has('reject')) return [];
    const finding: Finding = {
      ruleId: this.id,
      ruleVersion: this.version,
      category: this.category,
      severity: 'high',
      jurisdictions: this.jurisdictions,
      title: 'אין כפתור "דחייה" בשכבה הראשונה של באנר העוגיות',
      description:
        'הבאנר מציע "אישור" בלחיצה אחת, אך דחייה מחייבת כניסה להגדרות או אינה אפשרית. ' +
        'רגולטורים באירופה רואים בכך דפוס מטעה: דחייה צריכה להיות קלה ובולטת כמו אישור.',
      recommendation: 'הוסיפו כפתור "דחיית הכל" באותה רמה, גודל ובולטות של כפתור "אישור הכל".',
      references: [REFS.edpbTaskforce, REFS.edpbDarkPatterns, REFS.gdprConsent],
      evidence: [
        {
          mode: mode.mode,
          summary: `כפתורים שזוהו: ${mode.banner.buttons.map((b) => `${b.kind}="${b.text}"`).join(', ')}`,
          refs: [`${mode.mode}.banner`],
        },
      ],
    };
    return [finding];
  },
};

export const ckNoticeOnly: Rule = {
  id: 'CK-NOTICE-ONLY',
  version: '1.0.0',
  category: 'cookies',
  jurisdictions: ['EU', 'IL'],
  evaluate(evidence) {
    const mode = anyBanner(evidence);
    if (!mode) return [];
    const kinds = new Set(mode.banner.buttons.map((b) => b.kind));
    if (!kinds.has('acknowledge') || kinds.has('accept') || kinds.has('reject')) return [];
    return [
      {
        ruleId: this.id,
        ruleVersion: this.version,
        category: this.category,
        severity: hasConsentTrackers(evidence) ? 'medium' : 'low',
        jurisdictions: this.jurisdictions,
        title: 'באנר העוגיות הוא הודעה בלבד ("הבנתי") ללא אפשרות בחירה',
        description:
          'הבאנר מודיע על שימוש בעוגיות אך אינו מאפשר לסרב. הודעה כזו אינה נחשבת הסכמה לפי GDPR.',
        recommendation: 'החליפו את ההודעה בממשק בחירה עם "אישור הכל", "דחיית הכל" ו"ניהול העדפות".',
        references: [REFS.gdprConsent, REFS.edpbTaskforce],
        evidence: [
          {
            mode: mode.mode,
            summary: `כפתורים שזוהו: ${mode.banner.buttons.map((b) => `"${b.text}"`).join(', ')}`,
            refs: [`${mode.mode}.banner`],
          },
        ],
      },
    ];
  },
};

export const ckPrechecked: Rule = {
  id: 'CK-PRECHECKED',
  version: '1.0.0',
  category: 'cookies',
  jurisdictions: ['EU', 'IL'],
  evaluate(evidence) {
    const mode = anyBanner(evidence);
    if (!mode || mode.banner.precheckedLabels.length === 0) return [];
    return [
      {
        ruleId: this.id,
        ruleVersion: this.version,
        category: this.category,
        severity: 'high',
        jurisdictions: this.jurisdictions,
        title: 'קטגוריות עוגיות לא חיוניות מסומנות מראש',
        description: 'תיבות סימון מסומנות מראש אינן מהוות הסכמה פעילה ומפורשת.',
        recommendation: 'השאירו את כל הקטגוריות שאינן חיוניות לא מסומנות כברירת מחדל.',
        references: [REFS.cjeuPlanet49, REFS.gdprConsent],
        evidence: [
          {
            mode: mode.mode,
            summary: `מסומנות מראש: ${mode.banner.precheckedLabels.join(', ')}`,
            refs: [`${mode.mode}.banner.precheckedLabels`],
          },
        ],
      },
    ];
  },
};

export const ckNoRevisit: Rule = {
  id: 'CK-NO-REVISIT',
  version: '1.0.0',
  category: 'cookies',
  jurisdictions: ['EU', 'IL'],
  evaluate(evidence) {
    if (!anyBanner(evidence)) return [];
    const found = Object.values(evidence.modes).some((m) => m.banner.revisitControlFound);
    // Only conclusive if at least one consent click succeeded (banner dismissed, page re-checked).
    const clicked = Object.values(evidence.modes).some((m) => m.action?.clicked);
    if (found || !clicked) return [];
    return [
      {
        ruleId: this.id,
        ruleVersion: this.version,
        category: this.category,
        severity: 'medium',
        jurisdictions: this.jurisdictions,
        title: 'לא נמצאה דרך קבועה לשנות או למשוך הסכמה לעוגיות',
        description:
          'לאחר סגירת הבאנר לא זוהה קישור או כפתור כמו "הגדרות פרטיות ועוגיות". ' +
          'משיכת הסכמה צריכה להיות קלה כמו מתן הסכמה. (ייתכן שקיים אייקון ללא טקסט שלא זוהה — מומלץ לאמת.)',
        recommendation:
          'הוסיפו קישור קבוע ב-Footer ("הגדרות פרטיות ועוגיות") שפותח מחדש את ממשק ההסכמה.',
        references: [REFS.gdprWithdraw],
        evidence: [{ summary: 'לא זוהה רכיב לחזרה להגדרות לאחר סגירת הבאנר', refs: [] }],
      },
    ];
  },
};

export const ckActionFailed: Rule = {
  id: 'CK-ACTION-FAILED',
  version: '1.0.0',
  category: 'cookies',
  jurisdictions: ['EU', 'IL'],
  evaluate(evidence) {
    const findings: Finding[] = [];
    for (const mode of Object.values(evidence.modes)) {
      if (!mode.action || mode.action.clicked || !mode.banner.found) continue;
      if (mode.action.error === 'button-not-found') continue; // Covered by CK-NO-REJECT.
      findings.push({
        ruleId: this.id,
        ruleVersion: this.version,
        category: this.category,
        severity: 'info',
        jurisdictions: this.jurisdictions,
        title: `לא ניתן היה ללחוץ על כפתור ה${mode.action.kind === 'reject' ? 'דחייה' : 'אישור'} בבאנר`,
        description: 'הסורק זיהה את הכפתור אך הלחיצה נכשלה, ולכן בדיקת המצב הזה חלקית.',
        recommendation: 'בדקו ידנית שהכפתור פועל, נגיש למקלדת ואינו מוסתר על ידי רכיב אחר.',
        references: [],
        evidence: [
          {
            mode: mode.mode,
            summary: mode.action.error ?? 'unknown',
            refs: [`${mode.mode}.action`],
          },
        ],
      });
    }
    return findings;
  },
};
