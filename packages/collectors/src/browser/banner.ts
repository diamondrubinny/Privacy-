import type { BannerDetection } from '@privacyscan/shared';
import type { Frame, Page } from 'playwright-core';
import {
  BANNER_SCRIPT,
  type CmpSignature,
  type DetectorConfig,
  type FrameButton,
  type FrameDetection,
} from './banner-script.js';

/**
 * Known CMP selectors. Best-effort and version-sensitive: verify against live CMP releases
 * periodically. When a selector is missing, the text heuristic fills the gap inside the container.
 */
export const CMP_SIGNATURES: CmpSignature[] = [
  {
    id: 'onetrust',
    container: '#onetrust-banner-sdk',
    accept: '#onetrust-accept-btn-handler',
    reject: '#onetrust-reject-all-handler',
    settings: '#onetrust-pc-btn-handler',
    revisit: '#ot-sdk-btn, .ot-sdk-show-settings, #ot-sdk-btn-floating',
  },
  {
    id: 'cookiebot',
    container: '#CybotCookiebotDialog',
    accept:
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll, #CybotCookiebotDialogBodyButtonAccept',
    reject: '#CybotCookiebotDialogBodyButtonDecline',
    settings:
      '#CybotCookiebotDialogBodyButtonDetails, #CybotCookiebotDialogBodyLevelButtonCustomize',
    revisit: '#CookiebotWidget',
  },
  {
    id: 'cookieyes',
    container: '.cky-consent-container',
    accept: '.cky-btn-accept',
    reject: '.cky-btn-reject',
    settings: '.cky-btn-customize',
    revisit: '.cky-btn-revisit-wrapper, .cky-btn-revisit',
  },
  {
    id: 'complianz',
    container: '.cmplz-cookiebanner',
    accept: '.cmplz-accept',
    reject: '.cmplz-deny',
    settings: '.cmplz-view-preferences',
    revisit: '.cmplz-manage-consent',
  },
  {
    id: 'didomi',
    container: '#didomi-notice',
    accept: '#didomi-notice-agree-button',
    reject: '#didomi-notice-disagree-button',
    settings: '#didomi-notice-learn-more-button',
  },
  {
    id: 'cookie-notice',
    container: '#cookie-notice',
    accept: '#cn-accept-cookie',
    reject: '#cn-refuse-cookie',
    revisit: '#cn-revoke-cookie, .cn-revoke-cookie',
  },
  {
    id: 'cookie-law-info',
    container: '#cookie-law-info-bar',
    accept: '#wt-cli-accept-all-btn, #cookie_action_close_header',
    reject: '#cookie_action_close_header_reject, #wt-cli-reject-btn',
    settings: '.cli_settings_button',
    revisit: '#cookie-law-info-again',
  },
  { id: 'quantcast', container: '.qc-cmp2-container' },
  { id: 'usercentrics', container: '#usercentrics-root' },
];

/** Full-text patterns (anchored). Hebrew + English. */
export const PATTERNS: DetectorConfig['patterns'] = {
  reject:
    '^(?:reject(?: all)?(?: cookies)?|decline(?: all)?|deny(?: all)?|refuse(?: all)?|disagree|i do not agree|continue without accepting|(?:use |allow )?(?:only )?(?:strictly )?(?:necessary|essential)(?: cookies)?(?: only)?|דחי?יה(?: הכל| של הכל)?|דחה(?: הכל)?|דחיית הכל|דחיית כל העוגיות|לא מסכימ(?:ה|ים)?|אני לא מסכימ(?:ה)?|סרב|סירוב|(?:אשר |אישור )?רק (?:עוגיות )?(?:חיוניות|הכרחיות|נחוצות)|(?:עוגיות )?(?:חיוניות|הכרחיות|נחוצות) בלבד)$',
  accept:
    '^(?:accept(?: all)?(?: cookies)?|allow(?: all)?(?: cookies)?|agree|i agree|i accept|agree and (?:close|continue)|yes,? i agree|אישור(?: הכל| כל העוגיות)?|אשר(?: הכל)?|אני מסכימ(?:ה)?|מסכימ(?:ה|ים)?|קבל(?: הכל)?|קבלת הכל|אני מאשר(?:ת)?|מאשר(?:ת)?|אפשר הכל|אפשר את כל העוגיות|אישור והמשך)$',
  settings:
    '^(?:(?:cookie |privacy )?(?:settings|preferences)|manage(?: cookies| preferences| options| settings)?|customi[sz]e|more options|הגדרות(?: עוגיות| פרטיות)?|העדפות(?: עוגיות)?|ניהול(?: עוגיות| העדפות)?|התאמה אישית|אפשרויות נוספות)$',
  acknowledge:
    '^(?:ok|okay|got it|understood|close|dismiss|הבנתי(?:,? תודה)?|אוקיי|סגור|סגירה|המשך)$',
  cookieContext: 'cookie|עוגי|קוקי|consent|הסכמ|gdpr|privacy|פרטיות',
  revisit:
    '^(?:cookie settings|cookie preferences|manage cookies|privacy settings|privacy preferences|manage consent|your privacy choices|הגדרות (?:פרטיות|עוגיות)(?: ו(?:עוגיות|פרטיות))?|ניהול (?:עוגיות|הסכמה|העדפות(?: עוגיות| פרטיות)?)|העדפות (?:עוגיות|פרטיות))$',
  essentialLabel: 'necessary|essential|strictly|required|חיוני|הכרחי|נחוצ',
};

const MARK_ATTR = 'data-privacyscan-candidate';

const CONFIG: DetectorConfig = { markAttr: MARK_ATTR, patterns: PATTERNS, cmps: CMP_SIGNATURES };

/**
 * Playwright evaluates strings as expressions (it does not call a function string with `arg`),
 * so the static config is embedded as a JSON literal. CONFIG is a compile-time constant,
 * never user input.
 */
const DETECT_EXPRESSION = `(${BANNER_SCRIPT})(${JSON.stringify(CONFIG)})`;

export interface PageBanner {
  detection: BannerDetection;
  /** Frame + markers needed to click buttons later. */
  frame?: Frame;
  buttons: FrameButton[];
}

async function detectInFrame(frame: Frame): Promise<FrameDetection | null> {
  try {
    return await frame.evaluate<FrameDetection>(DETECT_EXPRESSION);
  } catch {
    // Detached or navigating frame: treat as "no banner here".
    return null;
  }
}

/** Detects a consent banner in the main frame first, then in child frames (iframe CMPs). */
export async function detectBanner(page: Page): Promise<PageBanner> {
  const main = page.mainFrame();
  const frames = [main, ...page.frames().filter((f) => f !== main)];
  let revisit = false;
  for (const frame of frames) {
    const result = await detectInFrame(frame);
    if (!result) continue;
    revisit ||= result.revisitControlFound;
    if (!result.found) continue;
    return {
      frame,
      buttons: result.buttons,
      detection: {
        found: true,
        ...(result.cmp === undefined ? {} : { cmp: result.cmp }),
        ...(frame === main ? {} : { frameUrl: new URL(frame.url()).origin }),
        buttons: result.buttons.map(({ kind, text, source }) => ({ kind, text, source })),
        precheckedLabels: result.precheckedLabels,
        revisitControlFound: revisit || result.revisitControlFound,
      },
    };
  }
  return {
    buttons: [],
    detection: { found: false, buttons: [], precheckedLabels: [], revisitControlFound: revisit },
  };
}

/** Clicks the first button of the requested kind. Returns an error code on failure. */
export async function clickConsent(
  banner: PageBanner,
  kind: 'accept' | 'reject',
  timeoutMs: number,
): Promise<{ clicked: boolean; error?: string; method?: 'dispatch' }> {
  const fallbackKinds: FrameButton['kind'][] =
    kind === 'accept' ? ['accept', 'acknowledge'] : ['reject'];
  const button = fallbackKinds
    .map((k) => banner.buttons.find((b) => b.kind === k))
    .find((b) => b !== undefined);
  if (!banner.frame || !button) return { clicked: false, error: 'button-not-found' };
  const locator = banner.frame.locator(`[${MARK_ATTR}="${button.marker}"]`).first();
  try {
    await locator.click({ timeout: timeoutMs });
    return { clicked: true };
  } catch {
    // Overlays or animations can block pointer actionability; fire the DOM click directly.
    try {
      await locator.dispatchEvent('click', undefined, { timeout: 2_000 });
      return { clicked: true, method: 'dispatch' };
    } catch {
      return { clicked: false, error: 'click-failed' };
    }
  }
}

/** Re-checks only the persistent "change consent" control (after the banner was dismissed). */
export async function detectRevisitControl(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    const result = await detectInFrame(frame);
    if (result?.revisitControlFound) return true;
  }
  return false;
}
