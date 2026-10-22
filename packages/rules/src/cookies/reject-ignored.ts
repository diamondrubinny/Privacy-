import type { Finding, Rule, Severity } from '@privacyscan/shared';
import { groupOffenders, isConsentModeDeniedOnly, REFS, refsOf, summarize } from '../helpers.js';

export const ckRejectIgnored: Rule = {
  id: 'CK-REJECT-IGNORED',
  version: '1.0.0',
  category: 'cookies',
  jurisdictions: ['EU', 'IL'],
  evaluate(evidence) {
    const mode = evidence.modes.reject;
    if (!mode?.action?.clicked) return [];
    // Only the fresh page view after the reload counts: scripts already running before the click
    // may legitimately send a final beacon. Earlier activity is covered by CK-PRECONSENT.
    const offenders = groupOffenders(mode, {
      request: (r) => r.phase === 'post-reload',
      cookie: (c) => c.phase === 'post-reload',
    });
    return offenders.map((o): Finding => {
      const consentMode = isConsentModeDeniedOnly(o);
      const severity: Severity = o.lowRisk ? 'low' : consentMode ? 'medium' : 'critical';
      return {
        ruleId: this.id,
        ruleVersion: this.version,
        category: this.category,
        severity,
        jurisdictions: this.jurisdictions,
        title: `${o.vendor} ממשיך לפעול אחרי שהמשתמש דחה עוגיות`,
        description: consentMode
          ? `לאחר לחיצה על "דחייה", ${o.vendor} ממשיך לשלוח בקשות במצב Consent Mode "denied" ללא עוגיות.`
          : `לאחר לחיצה על "דחייה" ורענון הדף, ${o.vendor} עדיין נטען ו/או יוצר עוגיות. ` +
            'המשמעות: הבחירה של המשתמש אינה מכובדת בפועל — זהו אחד הממצאים החמורים ביותר מבחינת רגולטורים.',
        recommendation:
          'בדקו שהכלי מחובר לקטגוריית ההסכמה הנכונה ב-CMP, ושאין טעינה ישירה של הסקריפט. ' +
          'לאחר דחייה יש למנוע טעינה ולמחוק עוגיות שכבר נוצרו ככל האפשר.',
        references: [REFS.ePrivacy, REFS.gdprConsent, REFS.gdprWithdraw, REFS.ilNotice],
        evidence: [{ mode: 'reject', summary: summarize(o), refs: refsOf(o) }],
      };
    });
  },
};
