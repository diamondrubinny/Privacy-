import type { A11yEvidence, A11yImpact } from '@privacyscan/shared';
import axe from 'axe-core';
import heLocale from 'axe-core/locales/he.json' with { type: 'json' };
import type { Page } from 'playwright-core';

interface AxeRawResult {
  violations: {
    id: string;
    impact?: string | null;
    help: string;
    helpUrl: string;
    tags: string[];
    nodes: { target: unknown[] }[];
  }[];
}

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const IMPACTS = new Set<string>(['minor', 'moderate', 'serious', 'critical']);

/** axe-core source plus the Hebrew locale, injected as one script. Static imports keep it bundled. */
const AXE_SCRIPT = `${axe.source};\naxe.configure({ locale: ${JSON.stringify(heLocale)} });`;

const RUN_EXPRESSION = `axe.run(document, {
  runOnly: { type: 'tag', values: ${JSON.stringify(WCAG_TAGS)} },
  resultTypes: ['violations'],
  elementRef: false,
})`;

/** Runs axe-core (WCAG 2.1 A/AA rules) and keeps a compact, snippet-free summary. */
export async function runAxe(page: Page, timeoutMs = 30_000): Promise<A11yEvidence> {
  const evidence: A11yEvidence = {
    engine: `axe-core@${axe.version}`,
    locale: 'he',
    violations: [],
  };
  try {
    await page.evaluate(AXE_SCRIPT);
    const result = await Promise.race([
      page.evaluate<AxeRawResult>(RUN_EXPRESSION),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          reject(new Error('axe-timeout'));
        }, timeoutMs),
      ),
    ]);
    evidence.violations = result.violations.map((v) => ({
      id: v.id,
      impact: v.impact && IMPACTS.has(v.impact) ? (v.impact as A11yImpact) : null,
      help: v.help.slice(0, 300),
      helpUrl: v.helpUrl.slice(0, 300),
      tags: v.tags.filter((t) => t.startsWith('wcag')).slice(0, 10),
      nodes: v.nodes.length,
      targets: v.nodes.slice(0, 3).map((n) => n.target.map(String).join(' ').slice(0, 200)),
    }));
  } catch (error) {
    evidence.error =
      error instanceof Error && error.message === 'axe-timeout' ? 'timeout' : 'axe-failed';
  }
  return evidence;
}
