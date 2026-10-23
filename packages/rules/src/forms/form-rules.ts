import type { Finding, FormEvidence, Rule, ScanEvidence } from '@privacyscan/shared';
import { getDomain } from 'tldts';
import {
  classifyForm,
  FIELD_LABELS_HE,
  formSignature,
  IDENTIFIER_KINDS,
  isBundledWithTerms,
  isMarketingConsent,
  SPECIAL_KINDS,
  type ClassifiedForm,
  type FieldKind,
} from '../classify/fields.js';
import { finding, REFS } from '../helpers.js';

/** Words indicating a privacy notice near the form (section 11 style) or a link to the policy. */
const NOTICE_TEXT =
  /מדיניות\s*(ה)?פרטיות|פרטיות|privacy|המידע\s*(ש)?(ימסר|יימסר|נמסר|ישמש|יישמר)|ישמש\s*לצורך|לצורך\s*(מענה|יצירת\s*קשר|טיפול)|אינ(ך|כם)\s*(חייב|מחויב)|חובה\s*חוקית/iu;
const PRIVACY_LINK = /privacy|pratiut|פרטיות/iu;

/** Unique personal-data forms across all audited pages. */
function personalForms(evidence: ScanEvidence): { c: ClassifiedForm; ref: string }[] {
  const out: { c: ClassifiedForm; ref: string }[] = [];
  const seen = new Set<string>();
  evidence.audit?.pages.forEach((page, p) => {
    page.forms.forEach((form, i) => {
      const c = classifyForm(form);
      const sig = formSignature(c);
      if (!c.personal || seen.has(sig)) return;
      seen.add(sig);
      out.push({ c, ref: `audit.pages[${p}].forms[${i}]` });
    });
  });
  return out;
}

function allForms(evidence: ScanEvidence): { form: FormEvidence; ref: string }[] {
  const out: { form: FormEvidence; ref: string }[] = [];
  const seen = new Set<string>();
  evidence.audit?.pages.forEach((page, p) => {
    page.forms.forEach((form, i) => {
      const sig = formSignature(classifyForm(form));
      if (seen.has(sig)) return;
      seen.add(sig);
      out.push({ form, ref: `audit.pages[${p}].forms[${i}]` });
    });
  });
  return out;
}

function describeForm(c: ClassifiedForm): string {
  const kinds = [...new Set(c.kinds.filter((k) => k !== 'other'))].map((k) => FIELD_LABELS_HE[k]);
  return `${c.form.pageUrl} — שדות: ${kinds.join(', ') || 'לא מזוהים'}`;
}

function hasNotice(form: FormEvidence): boolean {
  if (NOTICE_TEXT.test(form.contextText)) return true;
  if (form.checkboxes.some((cb) => NOTICE_TEXT.test(cb.label))) return true;
  return form.contextLinks.some((l) => PRIVACY_LINK.test(l.url) || PRIVACY_LINK.test(l.text));
}

export const formNoNotice: Rule = {
  id: 'FORM-NO-NOTICE',
  version: '1.0.0',
  category: 'forms',
  jurisdictions: ['IL', 'EU'],
  evaluate(evidence) {
    return personalForms(evidence)
      .filter(({ c }) => !hasNotice(c.form))
      .map(({ c, ref }) =>
        finding(this, {
          severity: 'medium',
          title: 'טופס שאוסף מידע אישי ללא יידוע או קישור למדיניות הפרטיות',
          description:
            'בעת בקשת מידע אישי יש ליידע את האדם: האם חלה עליו חובה חוקית למסור את המידע, למה ישמש המידע ולמי יימסר. ' +
            'ליד הטופס לא זוהה טקסט יידוע ולא קישור למדיניות הפרטיות.',
          recommendation:
            'הוסיפו מתחת לטופס הודעה קצרה (למשל: "המידע ישמש לצורך מענה לפנייתך. אינך חייב/ת למסור אותו על פי חוק. ' +
            'פרטים נוספים במדיניות הפרטיות") עם קישור למדיניות.',
          references: [REFS.ilSection11, REFS.gdprArt13],
          evidence: [{ summary: describeForm(c), refs: [ref] }],
        }),
      );
  },
};

export const formSensitiveData: Rule = {
  id: 'FORM-SENSITIVE-DATA',
  version: '1.0.0',
  category: 'forms',
  jurisdictions: ['IL', 'EU'],
  evaluate(evidence) {
    const findings: Finding[] = [];
    for (const { c, ref } of personalForms(evidence)) {
      const special = [...new Set(c.kinds.filter((k) => SPECIAL_KINDS.has(k)))];
      const identifiers = [...new Set(c.kinds.filter((k) => IDENTIFIER_KINDS.has(k)))];
      if (special.length === 0 && identifiers.length === 0) continue;
      const list = (kinds: FieldKind[]): string => kinds.map((k) => FIELD_LABELS_HE[k]).join(', ');
      findings.push(
        finding(this, {
          severity: special.length > 0 ? 'high' : 'medium',
          title:
            special.length > 0
              ? 'טופס מבקש מידע בעל רגישות מיוחדת'
              : 'טופס מבקש מספר זהות, תאריך לידה או מידע פיננסי',
          description:
            (special.length > 0
              ? `הטופס מבקש ${list(special)}. מידע כזה עשוי להיחשב "מידע בעל רגישות מיוחדת" ולחייב רמת אבטחה מוגברת, ` +
                'הצדקה ברורה למטרה ובחינת חובות נוספות (הודעה לרשות, ממונה פרטיות). '
              : '') +
            (identifiers.length > 0
              ? `הטופס מבקש ${list(identifiers)} — יש לוודא שאיסוף זה נחוץ למטרה (מזעור מידע).`
              : ''),
          recommendation:
            'צמצמו את השדות למה שנחוץ בפועל, הסבירו ליד השדה למה הוא נדרש, ובחנו עם עו"ד/ממונה פרטיות את רמת האבטחה הנדרשת למאגר.',
          references: [REFS.ilSensitive, REFS.ilSecurityRegs, REFS.gdprArt9],
          evidence: [{ summary: describeForm(c), refs: [ref] }],
        }),
      );
    }
    return findings;
  },
};

export const formInsecureSubmit: Rule = {
  id: 'FORM-INSECURE-SUBMIT',
  version: '1.0.0',
  category: 'forms',
  jurisdictions: ['IL', 'EU'],
  evaluate(evidence) {
    return personalForms(evidence)
      .filter(
        ({ c }) =>
          c.form.pageUrl.startsWith('http:') || c.form.action?.origin.startsWith('http:') === true,
      )
      .map(({ c, ref }) =>
        finding(this, {
          severity: 'high',
          title: 'מידע אישי נשלח בחיבור לא מוצפן (HTTP)',
          description:
            'הטופס מוצג או נשלח בכתובת http://. המידע שהמשתמש מקליד עובר ברשת ללא הצפנה וניתן ליירוט.',
          recommendation: 'העבירו את האתר ואת יעד הטופס ל-HTTPS בלבד.',
          references: [REFS.ilSecurityRegs, REFS.gdprArt32],
          evidence: [
            {
              summary: `${describeForm(c)} · יעד: ${c.form.action ? c.form.action.origin + c.form.action.path : 'אותו דף'}`,
              refs: [ref],
            },
          ],
        }),
      );
  },
};

export const formThirdPartyAction: Rule = {
  id: 'FORM-THIRD-PARTY-ACTION',
  version: '1.0.0',
  category: 'forms',
  jurisdictions: ['IL', 'EU'],
  evaluate(evidence) {
    const hosts = new Map<string, string[]>();
    for (const { c, ref } of personalForms(evidence)) {
      const target = c.form.action ? new URL(c.form.action.origin).hostname : undefined;
      const frame = c.form.frameOrigin ? new URL(c.form.frameOrigin).hostname : undefined;
      for (const host of [target, frame]) {
        if (!host || (getDomain(host) ?? host) === evidence.siteDomain) continue;
        hosts.set(host, [...(hosts.get(host) ?? []), ref]);
      }
    }
    if (hosts.size === 0) return [];
    return [
      finding(this, {
        severity: 'low',
        title: 'טפסים נשלחים לספק חיצוני',
        description:
          `מידע מטפסים באתר מועבר לשרתים של צד שלישי: ${[...hosts.keys()].join(', ')}. ` +
          'ספק כזה הוא בדרך כלל "מחזיק" / מעבד מידע, ויש לפרט אותו במדיניות ולהסדיר את היחסים בהסכם.',
        recommendation:
          'ציינו את הספק במדיניות הפרטיות, ודאו שקיים הסכם עיבוד מידע (DPA) ובדקו היכן מאוחסן המידע (העברה לחו"ל).',
        references: [REFS.ilSecurityRegs, REFS.ilTransferRegs, REFS.gdprArt28],
        evidence: [...hosts.entries()].map(([host, refs]) => ({ summary: host, refs })),
      }),
    ];
  },
};

export const spamOptinPrechecked: Rule = {
  id: 'SPAM-OPTIN-PRECHECKED',
  version: '1.0.0',
  category: 'forms',
  jurisdictions: ['IL', 'EU'],
  evaluate(evidence) {
    const findings: Finding[] = [];
    for (const { form, ref } of allForms(evidence)) {
      const bad = form.checkboxes.filter((cb) => isMarketingConsent(cb) && cb.checked);
      if (bad.length === 0) continue;
      findings.push(
        finding(this, {
          severity: 'high',
          title: 'תיבת הסכמה לדיוור שיווקי מסומנת מראש',
          description:
            'שליחת דברי פרסומת (דוא"ל, SMS) מחייבת הסכמה מפורשת ומראש. תיבה מסומנת כברירת מחדל אינה הסכמה מפורשת.',
          recommendation:
            'השאירו את תיבת ההסכמה לדיוור לא מסומנת, ואפשרו הרשמה גם ללא הסכמה לדיוור.',
          references: [REFS.spamLaw, REFS.cjeuPlanet49],
          evidence: [
            { summary: `${form.pageUrl} — "${bad.map((b) => b.label).join('", "')}"`, refs: [ref] },
          ],
        }),
      );
    }
    return findings;
  },
};

export const spamOptinBundled: Rule = {
  id: 'SPAM-OPTIN-BUNDLED',
  version: '1.0.0',
  category: 'forms',
  jurisdictions: ['IL', 'EU'],
  evaluate(evidence) {
    const findings: Finding[] = [];
    for (const { form, ref } of allForms(evidence)) {
      const bad = form.checkboxes.filter(
        (cb) => isMarketingConsent(cb) && (isBundledWithTerms(cb) || cb.required),
      );
      if (bad.length === 0) continue;
      findings.push(
        finding(this, {
          severity: 'medium',
          title: 'הסכמה לדיוור כרוכה בהסכמה לתקנון או שהיא חובה',
          description:
            'ההסכמה לקבלת דברי פרסומת צריכה להיות נפרדת וחופשית. תיבה אחת שמאחדת "תקנון" ו"דיוור", או תיבת דיוור שהיא שדה חובה, ' +
            'אינה מאפשרת לסרב לדיוור ולהמשיך להשתמש בשירות.',
          recommendation:
            'הפרידו לשתי תיבות: הסכמה לתקנון/מדיניות (אם נדרשת) והסכמה אופציונלית לדיוור.',
          references: [REFS.spamLaw, REFS.gdprConsent],
          evidence: [
            { summary: `${form.pageUrl} — "${bad.map((b) => b.label).join('", "')}"`, refs: [ref] },
          ],
        }),
      );
    }
    return findings;
  },
};

export const FORM_RULES: Rule[] = [
  formNoNotice,
  formSensitiveData,
  formInsecureSubmit,
  formThirdPartyAction,
  spamOptinPrechecked,
  spamOptinBundled,
];
