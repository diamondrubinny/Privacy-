/**
 * Multi-page fixture sites for the site audit (served over HTTPS and HTTP):
 * - shop.test:   staged violations in forms, policy, security headers and accessibility
 * - secure.test: a compliant counterpart that must produce no findings
 */

export interface FixtureResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: string | Buffer;
}

const GIF = Buffer.from('R0lGODlhAQABAAAAACw=', 'base64');

const html = (title: string, body: string, extraHead = ''): string => `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>${extraHead}</head>
<body>${body}</body></html>`;

const FILLER = 'פרטים נוספים על השירות ועל אופן הפעולה של האתר. '.repeat(40);

// ---------------------------------------------------------------- shop.test (violations)

const SHOP_NEWSLETTER = `<footer>
  <a href="/privacy">מדיניות פרטיות</a>
  <form action="https://forms.vendor.test/subscribe" method="post">
    <input type="email" name="email" aria-label="דוא&quot;ל">
    <label><input type="checkbox" name="agree" required> קראתי ואני מסכים/ה לתקנון ולקבלת דיוור</label>
    <button type="submit">הרשמה</button>
  </form>
</footer>`;

const SHOP_PAGES: Record<string, string> = {
  '/': html(
    'חנות לדוגמה',
    `<header><nav>
       <a href="/contact">צור קשר</a>
       <a href="/join">הצטרפות למועדון</a>
       <a href="/secret-offers">הרשמה למבצעים סודיים</a>
     </nav></header>
     <main><h1>חנות לדוגמה</h1>
       <img src="/logo.gif">
       <img src="http://shop.test/banner.gif" alt="באנר מבצעים">
       <button><svg width="10" height="10"></svg></button>
       <p>${FILLER}</p>
     </main>
     <script src="https://a11ywidget.test/widget.js"></script>
     ${SHOP_NEWSLETTER}`,
  ),
  '/contact': html(
    'צור קשר',
    `<main><h1>צור קשר</h1>
     <form action="http://shop.test/send" method="post">
       <label>שם מלא <input name="fullname" required></label>
       <label>טלפון <input type="tel" name="phone"></label>
       <label>מספר ת.ז <input name="tz"></label>
       <label>פרטים רפואיים רלוונטיים <textarea name="medical"></textarea></label>
       <label><input type="checkbox" name="ads" checked> אשמח לקבל דיוור ומבצעים</label>
       <button type="submit">שליחה</button>
     </form></main>${SHOP_NEWSLETTER}`,
  ),
  '/join': html(
    'הצטרפות למועדון',
    `<main><h1>הצטרפות למועדון</h1>
     <div class="join">
       <label for="n">שם</label><input id="n" name="name">
       <label for="e">דוא"ל</label><input id="e" type="email" name="email">
       <label for="b">תאריך לידה</label><input id="b" type="date" name="birthday">
       <button type="button">הצטרפות</button>
     </div></main>${SHOP_NEWSLETTER}`,
  ),
  '/privacy': html(
    'מדיניות פרטיות',
    `<main><h1>מדיניות פרטיות</h1>
     <p>עודכן לאחרונה: 01/03/2024</p>
     <p>חנות לדוגמה בע"מ מפעילה את האתר. אנו משתמשים בעוגיות כדי לשפר את השירות.</p>
     <p>${FILLER}</p></main>`,
  ),
  '/secret-offers': html('מבצעים', '<main><h1>מבצעים</h1></main>'),
};

function shop(path: string): FixtureResponse | null {
  if (path === '/robots.txt') {
    return {
      status: 200,
      headers: { 'content-type': 'text/plain' },
      body: 'User-agent: *\nDisallow: /secret-offers\n',
    };
  }
  if (path.endsWith('.gif'))
    return { status: 200, headers: { 'content-type': 'image/gif' }, body: GIF };
  if (path === '/send') return { status: 200, headers: {}, body: 'ok' };
  const page = SHOP_PAGES[path];
  if (!page) return null;
  // Deliberately weak: no security headers, version leak, session cookie without flags,
  // and HTTP is served as-is (no redirect to HTTPS) for either scheme.
  return {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-powered-by': 'PHP/7.4.3',
      'set-cookie': 'PHPSESSID=fixture-session; Path=/',
    },
    body: page,
  };
}

// ---------------------------------------------------------------- secure.test (compliant)

export const SECURE_POLICY_TEXT =
  'עודכן לאחרונה: 01/10/2025. אתר מאובטח בע"מ (ח.פ. 512345678) היא בעלת המאגר ומפעילת האתר. ' +
  'המידע שנאסף כולל שם, דוא"ל ותוכן הפנייה, וישמש לצורך מענה לפניות ומתן השירות. ' +
  'אינך חייב/ת על פי חוק למסור את המידע; המסירה נעשית מרצונך החופשי. ' +
  'אנו מעבירים מידע לספקים ונותני שירות (אחסון ודיוור) לצורך מתן השירות, וחלקם מאחסנים מידע מחוץ לישראל. ' +
  'המידע יישמר למשך 24 חודשים ולאחר מכן יימחק. אנו נוקטים אמצעי אבטחה מקובלים, כולל הצפנה. ' +
  'האתר אינו משתמש בעוגיות שאינן חיוניות. ' +
  'ניתן לעיין במידע, לתקנו או לבקש את מחיקתו בפנייה ל-privacy@secure.test. ' +
  'הבסיס החוקי לעיבוד הוא הסכמה ואינטרס לגיטימי. ניתן להגיש תלונה לרשות להגנת הפרטיות. ';

const SECURE_FOOTER = `<footer>
  <a href="/privacy">מדיניות פרטיות</a> · <a href="/accessibility">הצהרת נגישות</a>
</footer>`;

const SECURE_PAGES: Record<string, string> = {
  '/': html(
    'אתר מאובטח',
    `<header><nav aria-label="ניווט ראשי"><a href="/contact">צור קשר</a></nav></header>
     <main><h1>אתר מאובטח</h1>
       <form role="search" action="/search">
         <label>בדיקת שם דומיין <input name="domain"></label>
         <button type="submit">בדיקה</button>
       </form>
       <p>${FILLER}</p></main>${SECURE_FOOTER}`,
  ),
  '/contact': html(
    'צור קשר',
    `<header><nav aria-label="ניווט ראשי"><a href="/">דף הבית</a></nav></header>
     <main><h1>צור קשר</h1>
     <form action="/send" method="post">
       <label>שם מלא <input name="fullname" autocomplete="name" required></label>
       <label>דוא"ל <input type="email" name="email" autocomplete="email" required></label>
       <label>הודעה <textarea name="message"></textarea></label>
       <label><input type="checkbox" name="updates"> אשמח לקבל עדכונים ומבצעים</label>
       <textarea name="g-recaptcha-response" style="display:none" aria-hidden="true"></textarea>
       <input type="text" name="website_hp" style="display:none" tabindex="-1" aria-hidden="true">
       <p>המידע ישמש לצורך מענה לפנייתך. אינך חייב/ת למסור אותו על פי חוק.
          פרטים נוספים ב<a href="/privacy">מדיניות הפרטיות</a>.</p>
       <button type="submit">שליחה</button>
     </form></main>${SECURE_FOOTER}`,
  ),
  '/privacy': html(
    'מדיניות פרטיות',
    `<main><h1>מדיניות פרטיות</h1><p>${SECURE_POLICY_TEXT}</p><p>${FILLER}</p></main>${SECURE_FOOTER}`,
  ),
  '/accessibility': html(
    'הצהרת נגישות',
    `<main><h1>הצהרת נגישות</h1><p>האתר הונגש לפי WCAG 2.1 ברמה AA. רכזת נגישות: a11y@secure.test.</p></main>${SECURE_FOOTER}`,
  ),
};

const SECURE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'content-security-policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

function secure(path: string, scheme: 'http' | 'https'): FixtureResponse | null {
  if (scheme === 'http') {
    return { status: 301, headers: { location: `https://secure.test${path}` }, body: '' };
  }
  if (path === '/robots.txt')
    return {
      status: 200,
      headers: { 'content-type': 'text/plain' },
      body: 'User-agent: *\nAllow: /\n',
    };
  if (path === '/send') return { status: 200, headers: SECURE_HEADERS, body: 'ok' };
  const page = SECURE_PAGES[path];
  return page ? { status: 200, headers: SECURE_HEADERS, body: page } : null;
}

// ---------------------------------------------------------------- helpers

export const AUDIT_HOSTS = [
  'shop.test',
  'secure.test',
  'forms.vendor.test',
  'a11ywidget.test',
] as const;

export function auditSiteResponse(
  host: string,
  path: string,
  scheme: 'http' | 'https',
): FixtureResponse | null {
  const clean = path.split('?')[0] ?? '/';
  if (host === 'shop.test') return shop(clean);
  if (host === 'secure.test') return secure(clean, scheme);
  if (host === 'a11ywidget.test') {
    return {
      status: 200,
      headers: { 'content-type': 'text/javascript' },
      body: '/* accessibility widget */',
    };
  }
  if (host === 'forms.vendor.test') return { status: 200, headers: {}, body: 'ok' };
  return null;
}
