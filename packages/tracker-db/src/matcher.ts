import type { TrackerCategory, TrackerMatch } from '@privacyscan/shared';

export interface CookieRule {
  name: string;
  prefix?: boolean;
  /** Overrides the entry category for this cookie only. */
  category?: TrackerCategory;
}

export interface TrackerEntry {
  id: string;
  vendor: string;
  category: TrackerCategory;
  /** Hostname suffixes, matched on a label boundary ("facebook.com" matches "www.facebook.com"). */
  domains: string[];
  /** If present, the request path must match one of these regexes. */
  pathPatterns?: string[];
  cookies?: CookieRule[];
  /** Consent may be arguable for this tool; rules lower severity accordingly. */
  lowRisk?: boolean;
  note?: string;
}

export interface TrackerDataset {
  version: string;
  license?: string;
  entries: TrackerEntry[];
}

export interface TrackerMatchDetail extends TrackerMatch {
  lowRisk: boolean;
  note?: string;
}

interface CompiledEntry {
  entry: TrackerEntry;
  paths: RegExp[] | null;
}

function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function toMatch(entry: TrackerEntry, category: TrackerCategory): TrackerMatchDetail {
  return {
    vendor: entry.vendor,
    category,
    entryId: entry.id,
    lowRisk: entry.lowRisk ?? false,
    ...(entry.note === undefined ? {} : { note: entry.note }),
  };
}

/**
 * Classifies requests and cookies against a tracker dataset.
 * Most specific match wins: longer domain suffix, then path-specific entries, then exact cookie names.
 */
export class TrackerMatcher {
  readonly version: string;
  private readonly compiled: CompiledEntry[];

  constructor(dataset: TrackerDataset) {
    this.version = dataset.version;
    const ids = new Set<string>();
    this.compiled = dataset.entries.map((entry) => {
      if (ids.has(entry.id)) throw new Error(`Duplicate tracker entry id: ${entry.id}`);
      ids.add(entry.id);
      return {
        entry,
        paths: entry.pathPatterns ? entry.pathPatterns.map((p) => new RegExp(p)) : null,
      };
    });
  }

  matchRequest(hostname: string, path: string): TrackerMatchDetail | undefined {
    const host = hostname.toLowerCase();
    let best: { score: number; entry: TrackerEntry } | undefined;
    for (const { entry, paths } of this.compiled) {
      for (const domain of entry.domains) {
        if (!hostMatches(host, domain)) continue;
        if (paths && !paths.some((re) => re.test(path))) continue;
        const score = domain.length * 10 + (paths ? 5 : 0);
        if (!best || score > best.score) best = { score, entry };
      }
    }
    return best ? toMatch(best.entry, best.entry.category) : undefined;
  }

  matchCookie(name: string): TrackerMatchDetail | undefined {
    let best: { score: number; entry: TrackerEntry; rule: CookieRule } | undefined;
    for (const { entry } of this.compiled) {
      for (const rule of entry.cookies ?? []) {
        const hit = rule.prefix ? name.startsWith(rule.name) : name === rule.name;
        if (!hit) continue;
        // Exact names always beat prefixes; among prefixes the longest wins.
        const score = rule.prefix ? rule.name.length : 10_000;
        if (!best || score > best.score) best = { score, entry, rule };
      }
    }
    return best ? toMatch(best.entry, best.rule.category ?? best.entry.category) : undefined;
  }
}
