import type { LegalLinkRole, LinkRef } from '@privacyscan/shared';
import { getDomain } from 'tldts';

/**
 * Patterns (Hebrew + English) for legal/contact pages. Scoring: the whole link text is the page name
 * (4) > the name appears inside the text (2) > URL match (1); +1 when the link sits in the footer.
 * Anchoring matters: "סורק מדיניות פרטיות" (a product) must lose to "מדיניות פרטיות".
 */
const ROLE_PATTERNS: Record<LegalLinkRole, { text: RegExp; href: RegExp; exact: RegExp }> = {
  privacy: {
    text: /מדיניות\s*(ה)?פרטיות|הצהרת\s*פרטיות|privacy\s*(policy|notice|statement)|^פרטיות$|^privacy$/iu,
    href: /privacy|pratiut|פרטיות/iu,
    exact:
      /^(מדיניות\s*(ה)?פרטיות|הצהרת\s*(ה)?פרטיות|פרטיות|privacy(\s*(policy|notice|statement))?)$/iu,
  },
  accessibility: {
    text: /הצהרת\s*(ה)?נגישות|accessibility\s*statement|^נגישות$|^accessibility$/iu,
    href: /accessib|negishut|נגישות/iu,
    exact: /^(הצהרת\s*(ה)?נגישות|נגישות|accessibility(\s*statement)?)$/iu,
  },
  terms: {
    text: /תקנון|תנאי\s*(ה)?שימוש|terms\s*(of\s*(use|service))?|^terms$/iu,
    href: /terms|takanon|תקנון|tos\b/iu,
    exact: /^(תקנון(\s*(ה)?אתר)?|תנאי\s*(ה)?שימוש|terms(\s*of\s*(use|service))?)$/iu,
  },
  cookies: {
    text: /מדיניות\s*(ה)?עוגיות|cookie\s*policy/iu,
    href: /cookie-?policy|cookies-?policy|מדיניות-עוגיות/iu,
    exact: /^(מדיניות\s*(ה)?עוגיות|cookie\s*policy)$/iu,
  },
  contact: {
    text: /^(צור|צרו|יצירת)\s*קשר$|^contact(\s*us)?$/iu,
    href: /contact|צור-קשר/iu,
    exact: /^(צור|צרו|יצירת)\s*קשר$|^contact(\s*us)?$/iu,
  },
};

/** Pages likely to contain registration/checkout/newsletter forms. */
const FORM_PAGE_PATTERN =
  /הרשמה|הירשמ|הצטרפ|ניוזלטר|קופה|תשלום|הזמנה|התחבר|register|sign\s*-?up|join|newsletter|checkout|login|sign\s*in|apply|quote|הצעת\s*מחיר|פגישה|book/iu;

/** Consent-revisit controls look like privacy links but are not policy pages. */
const NOT_A_PAGE = /הגדרות|העדפות|settings|preferences|manage/iu;

export interface ClassifiedLinks {
  legal: Partial<Record<LegalLinkRole, LinkRef>>;
  /** Same-site links that likely contain forms, in page order. */
  formCandidates: LinkRef[];
  /** Remaining same-site links, in page order. */
  others: LinkRef[];
}

function normalize(raw: string, base: string): URL | null {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function decodedPath(url: URL): string {
  try {
    return decodeURIComponent(url.pathname);
  } catch {
    return url.pathname;
  }
}

export function sameSite(url: URL, siteDomain: string): boolean {
  return (getDomain(url.hostname) ?? url.hostname) === siteDomain;
}

/**
 * Classifies anchors found on the home page. Legal links may point off-site (hosted policies);
 * crawl candidates are same-site only.
 */
export function classifyLinks(
  links: readonly (LinkRef & { inFooter?: boolean })[],
  baseUrl: string,
  siteDomain: string,
): ClassifiedLinks {
  const legal: ClassifiedLinks['legal'] = {};
  const scores: Partial<Record<LegalLinkRole, number>> = {};
  const formCandidates: LinkRef[] = [];
  const others: LinkRef[] = [];
  const seen = new Set<string>();
  const base = normalize(baseUrl, baseUrl)?.href;

  for (const link of links) {
    const url = normalize(link.url, baseUrl);
    if (!url) continue;
    const text = link.text.replace(/\s+/g, ' ').trim().slice(0, 120);
    const path = decodedPath(url);
    const isSelf = url.href === base;

    if (!isSelf && !NOT_A_PAGE.test(text)) {
      for (const role of Object.keys(ROLE_PATTERNS) as LegalLinkRole[]) {
        const p = ROLE_PATTERNS[role];
        const base = p.exact.test(text) ? 4 : p.text.test(text) ? 2 : p.href.test(path) ? 1 : 0;
        const score = base > 0 && link.inFooter ? base + 1 : base;
        if (score > (scores[role] ?? 0)) {
          scores[role] = score;
          legal[role] = { url: url.href, text };
        }
      }
    }

    if (isSelf || seen.has(url.href) || !sameSite(url, siteDomain)) continue;
    seen.add(url.href);
    const ref = { url: url.href, text };
    if (FORM_PAGE_PATTERN.test(text) || FORM_PAGE_PATTERN.test(path)) formCandidates.push(ref);
    else others.push(ref);
  }
  return { legal, formCandidates, others };
}
