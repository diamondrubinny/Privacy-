import type { Rule } from '@privacyscan/shared';
import { needsConsent, REFS } from '../helpers.js';

/** 13 months (≈395 days); Chromium caps cookie lifetime at 400 days. */
export const MAX_RECOMMENDED_LIFETIME_DAYS = 395;

export const ckLongRetention: Rule = {
  id: 'CK-LONG-RETENTION',
  version: '1.0.0',
  category: 'cookies',
  jurisdictions: ['EU'],
  evaluate(evidence) {
    const long = new Map<string, { days: number; ref: string }>();
    for (const mode of Object.values(evidence.modes)) {
      mode.cookies.forEach((c, i) => {
        if (c.expires <= 0 || !needsConsent(c)) return;
        const days = Math.round((c.expires - mode.capturedAt) / 86_400);
        const prev = long.get(c.name);
        if (days > MAX_RECOMMENDED_LIFETIME_DAYS && (!prev || days > prev.days)) {
          long.set(c.name, { days, ref: `${mode.mode}.cookies[${i}]` });
        }
      });
    }
    if (long.size === 0) return [];
    const entries = [...long.entries()].sort(([a], [b]) => a.localeCompare(b));
    return [
      {
        ruleId: this.id,
        ruleVersion: this.version,
        category: this.category,
        severity: 'low',
        jurisdictions: this.jurisdictions,
        title: 'עוגיות מעקב עם תוקף ארוך מ-13 חודשים',
        description:
          'עוגיות אנליטיקה/שיווק נשמרות במכשיר המשתמש לתקופה ארוכה. רגולטורים באירופה ממליצים על תוקף מרבי של 13 חודשים, ' +
          'ובחידוש הסכמה בתדירות דומה.',
        recommendation:
          'קצרו את תוקף העוגיות בהגדרות הכלי (למשל cookie_expires ב-Google Analytics).',
        references: [REFS.cnilRetention],
        evidence: [
          {
            summary: entries.map(([name, v]) => `${name}: ${v.days} ימים`).join(', '),
            refs: entries.map(([, v]) => v.ref),
          },
        ],
      },
    ];
  },
};
