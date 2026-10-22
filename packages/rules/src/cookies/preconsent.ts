import type { Finding, Rule, Severity } from '@privacyscan/shared';
import {
  groupOffenders,
  isConsentModeDeniedOnly,
  preConsentView,
  REFS,
  refsOf,
  summarize,
} from '../helpers.js';

export const ckPreconsent: Rule = {
  id: 'CK-PRECONSENT',
  version: '1.0.0',
  category: 'cookies',
  jurisdictions: ['EU', 'IL'],
  evaluate(evidence) {
    const view = preConsentView(evidence);
    if (!view) return [];
    const phaseOk = (p: string): boolean => !view.preActionOnly || p === 'pre-action';
    const offenders = groupOffenders(view.mode, {
      request: (r) => phaseOk(r.phase),
      cookie: (c) => phaseOk(c.phase),
    });
    return offenders.map((o): Finding => {
      const consentMode = isConsentModeDeniedOnly(o);
      const severity: Severity = o.lowRisk ? 'low' : consentMode ? 'medium' : 'high';
      return {
        ruleId: this.id,
        ruleVersion: this.version,
        category: this.category,
        severity,
        jurisdictions: this.jurisdictions,
        title: `${o.vendor} פועל לפני שהמשתמש נתן הסכמה`,
        description: consentMode
          ? `${o.vendor} שולח בקשות לפני הסכמה במצב Google Consent Mode "denied" (gcs=G100), ללא עוגיות. ` +
            'גם במצב זה נשלח מידע (למשל כתובת IP ופרטי דפדפן) לצד שלישי; ההתאמה לדרישות הסכמה שנויה במחלוקת.'
          : `${o.vendor} נטען ואוסף מידע על המבקר עוד לפני שניתנה הסכמה לעוגיות אנליטיקה/שיווק. ` +
            'לפי GDPR ו-ePrivacy נדרשת הסכמה מראש לכלים שאינם חיוניים; בישראל זו פרקטיקה מומלצת שמחזקת את עמידה בחובת היידוע.',
        recommendation:
          'הגדירו את מערכת ניהול ההסכמה (CMP) או את Google Tag Manager כך שהכלי ייטען רק לאחר אישור הקטגוריה המתאימה. ' +
          'ודאו שאין קוד הטמעה ישיר של הכלי בתבנית האתר שעוקף את ה-CMP.',
        references: [REFS.ePrivacy, REFS.gdprConsent, REFS.ilNotice],
        evidence: [{ mode: view.mode.mode, summary: summarize(o), refs: refsOf(o) }],
      };
    });
  },
};
