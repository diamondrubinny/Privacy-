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
  action?: {
    kind: 'accept' | 'reject';
    clicked: boolean;
    error?: string;
    /** 'dispatch' when the pointer click was blocked and a DOM click event was fired instead. */
    method?: 'dispatch';
  };
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

export type PageRole =
  'home' | 'privacy' | 'accessibility' | 'terms' | 'cookies' | 'contact' | 'other';

export type LegalLinkRole = Exclude<PageRole, 'home' | 'other'>;

export interface LinkRef {
  url: string;
  text: string;
}

/** A form control, described by its visible/declared hints only. Values are never read. */
export interface FormFieldEvidence {
  tag: 'input' | 'select' | 'textarea';
  type: string;
  /** Label, aria-label, placeholder, name, id, autocomplete — joined, truncated. */
  hints: string;
  autocomplete: string;
  required: boolean;
}

export interface FormCheckboxEvidence {
  label: string;
  checked: boolean;
  required: boolean;
}

export interface FormEvidence {
  pageUrl: string;
  /** Origin of the frame when the form lives in an iframe (e.g. embedded form vendors). */
  frameOrigin?: string;
  index: number;
  /** "form" = <form> element; "implicit" = inputs grouped without a <form>. */
  kind: 'form' | 'implicit';
  visible: boolean;
  /** Submission target without query string. */
  action?: { origin: string; path: string };
  method: string;
  fields: FormFieldEvidence[];
  checkboxes: FormCheckboxEvidence[];
  /** Visible text of the form and its surrounding container (truncated). */
  contextText: string;
  /** Links inside the form's surrounding container. */
  contextLinks: LinkRef[];
}

export type A11yImpact = 'minor' | 'moderate' | 'serious' | 'critical';

export interface A11yViolation {
  id: string;
  impact: A11yImpact | null;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: number;
  /** CSS selectors of up to 3 offending elements (no HTML snippets are stored). */
  targets: string[];
}

export interface A11yEvidence {
  engine: string;
  locale: string;
  violations: A11yViolation[];
  error?: string;
}

export interface AuditedPage {
  url: string;
  finalUrl: string;
  role: PageRole;
  status?: number;
  error?: string;
  lang?: string;
  title?: string;
  /** Share of Hebrew letters among Hebrew+Latin letters in the visible text (0..1). */
  hebrewRatio?: number;
  /** http:// resources referenced by an https:// page (origin + path). */
  insecureResources?: string[];
  forms: FormEvidence[];
  a11y?: A11yEvidence;
}

export interface SecurityEvidence {
  finalUrl: string;
  status?: number;
  /** Allow-listed response headers of the main document (lowercase names). */
  headers: Record<string, string>;
  tls?: { protocol: string; issuer?: string; validTo?: number };
  /** Whether http:// redirects to https:// — null when not tested or unreachable. */
  httpRedirectsToHttps: boolean | null;
}

export interface PolicyEvidence {
  url: string;
  status?: number;
  error?: string;
  lang?: string;
  /** Visible text of the policy page (public content), truncated. */
  text: string;
  truncated: boolean;
}

export interface SiteAuditEvidence {
  /** Unix seconds; reference point for time-relative checks (e.g. certificate expiry). */
  capturedAt: number;
  robots: { status: number | null; disallowedSkipped: string[] };
  pages: AuditedPage[];
  legalLinks: Partial<Record<LegalLinkRole, LinkRef>>;
  security?: SecurityEvidence;
  policy?: PolicyEvidence;
  error?: string;
}

export interface ScanEvidence {
  targetUrl: string;
  /** Registrable domain (eTLD+1) of the target, used for first/third-party decisions. */
  siteDomain: string;
  modes: Partial<Record<BrowserMode, ModeEvidence>>;
  /** Multi-page site audit (forms, policy, security, accessibility). */
  audit?: SiteAuditEvidence;
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
    /** Operator-declared egress location (e.g. "IL"); banners and trackers vary by country. */
    scanLocation?: string;
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
