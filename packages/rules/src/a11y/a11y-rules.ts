import type { A11yImpact, Finding, Rule, ScanEvidence, Severity } from '@privacyscan/shared';
import { finding, REFS } from '../helpers.js';

const IMPACT_SEVERITY: Record<A11yImpact, Severity> = {
  critical: 'high',
  serious: 'medium',
  moderate: 'low',
  minor: 'info',
};

/** Tracker-db entries for accessibility overlay widgets use the "a11y-" id prefix. */
const OVERLAY_PREFIX = 'a11y-';

function homeLoaded(evidence: ScanEvidence): boolean {
  const h = evidence.audit?.pages.find((p) => p.role === 'home');
  return h !== undefined && h.error === undefined && (h.status ?? 0) < 400;
}

export const a11yStatementMissing: Rule = {
  id: 'A11Y-STATEMENT-MISSING',
  version: '1.0.0',
  category: 'a11y',
  jurisdictions: ['IL'],
  evaluate(evidence) {
    if (!homeLoaded(evidence) || evidence.audit?.legalLinks.accessibility) return [];
    return [
      finding(this, {
        severity: 'medium',
        title: 'לא נמצא קישור להצהרת נגישות',
        description:
          'אתרים של נותני שירות לציבור בישראל נדרשים, ככלל, לפרסם הצהרת נגישות הכוללת את ההתאמות שבוצעו ופרטי קשר לפניות נגישות. ' +
          'החובה, הפטורים ומועדי היישום תלויים בסוג העסק — יש לבדוק עם יועץ נגישות.',
        recommendation:
          'פרסמו עמוד "הצהרת נגישות" וקשרו אליו מה-Footer בכל דף: רמת התקן, התאמות, מגבלות ידועות, תאריך עדכון ופרטי רכז/ת נגישות.',
        references: [REFS.ilA11yRegs, REFS.is5568],
        evidence: [{ summary: 'לא זוהה קישור מתאים בדף הבית', refs: ['audit.legalLinks'] }],
      }),
    ];
  },
};

/** One finding per axe rule, aggregated across audited pages. */
export const a11yAxe: Rule = {
  id: 'A11Y-AXE',
  version: '1.0.0',
  category: 'a11y',
  jurisdictions: ['IL', 'EU'],
  evaluate(evidence) {
    const byRule = new Map<
      string,
      {
        help: string;
        helpUrl: string;
        impact: A11yImpact | null;
        nodes: number;
        pages: string[];
        refs: string[];
        targets: string[];
      }
    >();
    evidence.audit?.pages.forEach((page, p) => {
      page.a11y?.violations.forEach((v, i) => {
        const agg = byRule.get(v.id) ?? {
          help: v.help,
          helpUrl: v.helpUrl,
          impact: v.impact,
          nodes: 0,
          pages: [],
          refs: [],
          targets: [],
        };
        agg.nodes += v.nodes;
        agg.pages.push(page.finalUrl);
        agg.refs.push(`audit.pages[${p}].a11y.violations[${i}]`);
        agg.targets.push(...v.targets);
        byRule.set(v.id, agg);
      });
    });
    const findings: Finding[] = [];
    for (const [id, v] of byRule) {
      findings.push(
        finding(this, {
          ruleId: `A11Y-AXE-${id}`,
          severity: v.impact ? IMPACT_SEVERITY[v.impact] : 'low',
          title: `נגישות: ${v.help}`,
          description:
            `רכיבים בעייתיים: ${v.nodes}, בדפים שנבדקו: ${v.pages.length} (בדיקה אוטומטית לפי WCAG 2.1 AA). ` +
            'בדיקה אוטומטית מזהה רק חלק מבעיות הנגישות; נדרשת גם בדיקה ידנית.',
          recommendation: `ראו הסבר ודרכי תיקון: ${v.helpUrl}`,
          references: [REFS.wcag21, REFS.is5568, REFS.ilA11yRegs],
          evidence: [{ summary: [...new Set(v.targets)].slice(0, 3).join(' · '), refs: v.refs }],
        }),
      );
    }
    return findings;
  },
};

export const a11yOverlayOnly: Rule = {
  id: 'A11Y-OVERLAY-ONLY',
  version: '1.0.0',
  category: 'a11y',
  jurisdictions: ['IL', 'EU'],
  evaluate(evidence) {
    const overlays = new Set<string>();
    for (const mode of Object.values(evidence.modes)) {
      for (const r of mode.requests) {
        if (r.tracker?.entryId.startsWith(OVERLAY_PREFIX)) overlays.add(r.tracker.vendor);
      }
    }
    const serious = (evidence.audit?.pages ?? []).some((p) =>
      p.a11y?.violations.some((v) => v.impact === 'critical' || v.impact === 'serious'),
    );
    if (overlays.size === 0 || !serious) return [];
    return [
      finding(this, {
        severity: 'info',
        title: 'באתר יש "כפתור נגישות", אבל נמצאו בעיות נגישות בקוד',
        description:
          `זוהה תוסף נגישות (${[...overlays].join(', ')}), ובמקביל נמצאו בעיות חמורות בבדיקה האוטומטית. ` +
          'תוסף נגישות אינו מחליף התאמה של הקוד, העיצוב והתוכן עצמם.',
        recommendation:
          'תקנו את הבעיות בקוד המקור (ראו ממצאי A11Y-AXE) ובצעו בדיקה ידנית עם מקלדת וקורא מסך.',
        references: [REFS.wcag21, REFS.is5568],
        evidence: [{ summary: [...overlays].join(', '), refs: [] }],
      }),
    ];
  },
};

export const A11Y_RULES: Rule[] = [a11yStatementMissing, a11yAxe, a11yOverlayOnly];
