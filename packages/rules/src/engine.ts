import type {
  Finding,
  FindingCategory,
  Rule,
  ScanEvidence,
  ScanResult,
  Severity,
} from '@privacyscan/shared';
import {
  ckActionFailed,
  ckNoBanner,
  ckNoReject,
  ckNoRevisit,
  ckNoticeOnly,
  ckPrechecked,
} from './cookies/banner.js';
import { ckPreconsent } from './cookies/preconsent.js';
import { ckRejectIgnored } from './cookies/reject-ignored.js';
import { ckLongRetention } from './cookies/retention.js';
import { A11Y_RULES } from './a11y/a11y-rules.js';
import { FORM_RULES } from './forms/form-rules.js';
import { POLICY_RULES } from './policy/policy-rules.js';
import { SECURITY_RULES } from './security/security-rules.js';

/** Bump on any rule change; stored with every scan for reproducibility. */
export const RULESET_VERSION = '2026.10.1';

export const DEFAULT_RULES: readonly Rule[] = [
  ckPreconsent,
  ckRejectIgnored,
  ckNoBanner,
  ckNoReject,
  ckNoticeOnly,
  ckPrechecked,
  ckNoRevisit,
  ckLongRetention,
  ckActionFailed,
  ...POLICY_RULES,
  ...FORM_RULES,
  ...SECURITY_RULES,
  ...A11Y_RULES,
];

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export interface EngineOutput {
  findings: Finding[];
  ruleErrors: ScanResult['ruleErrors'];
}

/** Runs every rule in isolation: one failing rule never hides the others' findings. */
export function runRules(
  evidence: ScanEvidence,
  rules: readonly Rule[] = DEFAULT_RULES,
): EngineOutput {
  const findings: Finding[] = [];
  const ruleErrors: EngineOutput['ruleErrors'] = [];
  for (const rule of rules) {
    try {
      findings.push(...rule.evaluate(evidence));
    } catch (error) {
      ruleErrors.push({
        ruleId: rule.id,
        message: error instanceof Error ? error.message.slice(0, 200) : 'unknown error',
      });
    }
  }
  findings.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.ruleId.localeCompare(b.ruleId),
  );
  return { findings, ruleErrors };
}

const CATEGORIES: FindingCategory[] = ['cookies', 'policy', 'forms', 'security', 'a11y', 'vendors'];

/**
 * Risk level per category — deliberately not a "compliance %".
 * Categories not yet covered by the ruleset report 'none' with count 0.
 */
export function summarizeFindings(findings: readonly Finding[]): ScanResult['summary'] {
  const summary = {} as ScanResult['summary'];
  for (const category of CATEGORIES) {
    const items = findings.filter((f) => f.category === category);
    const worst = Math.min(...items.map((f) => SEVERITY_ORDER[f.severity]), SEVERITY_ORDER.info);
    const risk =
      worst <= SEVERITY_ORDER.high
        ? 'high'
        : worst === SEVERITY_ORDER.medium
          ? 'medium'
          : items.some((f) => f.severity === 'low')
            ? 'low'
            : 'none';
    summary[category] = { risk, count: items.length };
  }
  return summary;
}
