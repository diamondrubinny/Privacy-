/** Tracker/cookie purpose category, aligned with common CMP taxonomies. */
export type TrackerCategory = 'essential' | 'functional' | 'analytics' | 'marketing';

/** Categories that require prior consent (GDPR/ePrivacy; recommended practice in Israel). */
export const CONSENT_REQUIRED_CATEGORIES: ReadonlySet<TrackerCategory> = new Set([
  'analytics',
  'marketing',
]);

export type BrowserMode = 'baseline' | 'reject' | 'accept';

/**
 * When an observation happened within a mode:
 * - pre-action: before any consent click
 * - post-action: between the click and the reload (scripts already running may still fire)
 * - post-reload: on the fresh page view after the click — the decisive evidence of whether
 *   the consent choice is honored
 */
export type ObservationPhase = 'pre-action' | 'post-action' | 'post-reload';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingCategory = 'cookies' | 'policy' | 'forms' | 'security' | 'a11y' | 'vendors';

export type Jurisdiction = 'IL' | 'EU';

export interface TrackerMatch {
  vendor: string;
  category: TrackerCategory;
  /** ID of the dataset entry that matched, for traceability. */
  entryId: string;
  /** Consent requirement is arguable for this tool (e.g. cookieless analytics). */
  lowRisk?: boolean;
}

/**
 * A network request with data minimization applied:
 * query values are dropped, only parameter names are kept.
 */
export interface RequestRecord {
  origin: string;
  path: string;
  queryKeys: string[];
  resourceType: string;
  method: string;
  hostname: string;
  thirdParty: boolean;
  phase: ObservationPhase;
  tracker?: TrackerMatch;
  /**
   * Google Consent Mode state (`gcs` parameter, e.g. "G100" = ad & analytics storage denied).
   * The only query value we keep; it is a fixed-format, non-personal flag.
   */
  consentSignal?: string;
  /** Set when the egress proxy or a failure prevented the request from completing. */
  failure?: string;
}

/** A cookie, without its value. */
export interface CookieRecord {
  name: string;
  domain: string;
  path: string;
  /** Unix seconds; -1 for session cookies. */
  expires: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
  thirdParty: boolean;
  phase: ObservationPhase;
  tracker?: TrackerMatch;
}

export type ConsentButtonKind = 'accept' | 'reject' | 'settings' | 'acknowledge';

export interface ConsentButton {
  kind: ConsentButtonKind;
  text: string;
  /** How the button was found: a known CMP selector or the generic text heuristic. */
  source: 'cmp' | 'heuristic';
}

export interface BannerDetection {
  found: boolean;
  /** Known CMP identifier (e.g. "onetrust"), or "generic". */
  cmp?: string;
  /** Frame URL when the banner lives in an iframe. */
  frameUrl?: string;
  buttons: ConsentButton[];
  /** Labels of non-essential, pre-checked checkboxes inside the banner. */
  precheckedLabels: string[];
  /** A persistent control to re-open consent preferences was found. */
  revisitControlFound: boolean;
}

export interface ModeEvidence {
  mode: BrowserMode;
  finalUrl: string;
  /** Unix seconds when the mode finished; reference point for cookie lifetimes. */
  capturedAt: number;
  /** Consent action performed in this mode, if any. */
  action?: { kind: 'accept' | 'reject'; clicked: boolean; error?: string };
  banner: BannerDetection;
  requests: RequestRecord[];
  cookies: CookieRecord[];
  /** localStorage/sessionStorage key names of the top frame (values are never stored). */
  storageKeys: { local: string[]; session: string[] };
  /** Requests refused by the egress proxy (SSRF policy). */
  blockedRequests: { host: string; reason: string }[];
  truncated: boolean;
  error?: string;
}

export interface ScanEvidence {
  targetUrl: string;
  /** Registrable domain (eTLD+1) of the target, used for first/third-party decisions. */
  siteDomain: string;
  modes: Partial<Record<BrowserMode, ModeEvidence>>;
}

export interface Finding {
  ruleId: string;
  ruleVersion: string;
  category: FindingCategory;
  severity: Severity;
  jurisdictions: Jurisdiction[];
  /** Hebrew, user-facing. */
  title: string;
  /** Hebrew, user-facing explanation of why this matters. */
  description: string;
  /** Hebrew, user-facing remediation guidance. */
  recommendation: string;
  /** Short references to the legal/standard source; verification required. */
  references: string[];
  /** Pointers into the evidence (e.g. "baseline.requests[3]") plus a compact human summary. */
  evidence: { mode?: BrowserMode; summary: string; refs: string[] }[];
}

export interface Rule {
  id: string;
  version: string;
  category: FindingCategory;
  jurisdictions: Jurisdiction[];
  evaluate(evidence: ScanEvidence): Finding[];
}

export interface InventoryTracker {
  vendor: string;
  category: TrackerCategory;
  hostnames: string[];
  seenIn: BrowserMode[];
  /** Observed before any consent (baseline mode or pre-action). */
  beforeConsent: boolean;
}

export interface InventoryCookie {
  name: string;
  domain: string;
  vendor?: string;
  category?: TrackerCategory;
  /** Max observed lifetime in days; null for session cookies. */
  maxLifetimeDays: number | null;
  thirdParty: boolean;
  seenIn: BrowserMode[];
}

export interface ScanResult {
  schemaVersion: 1;
  scanId: string;
  targetUrl: string;
  siteDomain: string;
  startedAt: string;
  finishedAt: string;
  rulesetVersion: string;
  trackerDbVersion: string;
  environment: {
    browserVersion: string;
    userAgent: string;
    locale: string;
    timezoneId: string;
    viewport: { width: number; height: number };
  };
  disclaimer: string;
  evidence: ScanEvidence;
  inventory: {
    trackers: InventoryTracker[];
    cookies: InventoryCookie[];
    unclassifiedThirdPartyHosts: string[];
  };
  findings: Finding[];
  /** Rules that threw; their absence of findings must not be read as "no issue". */
  ruleErrors: { ruleId: string; message: string }[];
  summary: Record<FindingCategory, { risk: 'none' | 'low' | 'medium' | 'high'; count: number }>;
}
