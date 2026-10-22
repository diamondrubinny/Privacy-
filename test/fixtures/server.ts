import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { TrackerDataset } from '@privacyscan/tracker-db';

/**
 * Staged websites for end-to-end tests. All hosts resolve to this server through the
 * egress proxy's test-only host overrides. Trackers are emulated on fake ".test" domains.
 */

export const FIXTURE_HOSTS = [
  'bad.test',
  'ignore.test',
  'good.test',
  'notice.test',
  'analytics.test',
  'ads.test',
] as const;

export const FIXTURE_DATASET: TrackerDataset = {
  version: 'fixture-1',
  entries: [
    {
      id: 'test-analytics',
      vendor: 'Test Analytics',
      category: 'analytics',
      domains: ['analytics.test'],
      cookies: [{ name: '_test_ga', prefix: true }],
    },
    { id: 'test-ads', vendor: 'Test Ads', category: 'marketing', domains: ['ads.test'] },
  ],
};

const page = (title: string, head: string, body: string): string => `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${title}</title>${head}</head>
<body><h1>${title}</h1>${body}</body></html>`;

const BANNER_STYLE = 'position:fixed;bottom:0;inset-inline:0;background:#fff;padding:16px';

const loadAnalytics = `(() => { const s = document.createElement('script'); s.src = 'http://analytics.test/collect.js'; document.head.appendChild(s); })();`;
const firePixel = `new Image().src = 'http://ads.test/pixel.gif?id=1';`;

function sites(selfPort: number): Record<string, string> {
  return {
    // Violations: pre-consent analytics + 2-year cookie, no reject, pre-checked marketing,
    // no revisit link, plus attempts to reach internal addresses.
    'bad.test': page(
      'חנות לא תקינה',
      `<script>
        document.cookie = '_test_ga=GA1.1.1; max-age=63072000; path=/';
        ${loadAnalytics}
        if (document.cookie.includes('consent=')) { ${firePixel} }
      </script>`,
      `<img src="http://127.0.0.1:${selfPort}/secret" alt="">
       <img src="http://169.254.169.254/latest/meta-data/" alt="">
       <div id="banner" style="${BANNER_STYLE}">
         <p>אנחנו משתמשים בעוגיות כדי לשפר את החוויה באתר.</p>
         <label><input type="checkbox" checked> שיווק</label>
         <label><input type="checkbox" checked disabled> חיוניות</label>
         <button id="accept">אישור הכל</button>
         <button id="settings">הגדרות</button>
       </div>
       <script>
         const hide = () => document.getElementById('banner')?.remove();
         if (document.cookie.includes('consent=')) hide();
         document.getElementById('accept').onclick = () => { document.cookie = 'consent=all; path=/'; hide(); };
       </script>`,
    ),
    // Reject button exists but the choice is ignored on the next page view.
    'ignore.test': page(
      'אתר שמתעלם מדחייה',
      `<script>if (document.cookie.includes('consent=')) { ${firePixel} }</script>`,
      `<div id="banner" style="${BANNER_STYLE}">
         <p>האתר משתמש בעוגיות. פרטים במדיניות הפרטיות.</p>
         <button id="accept">אישור הכל</button>
         <button id="reject">דחיית הכל</button>
       </div>
       <footer><a href="#" id="revisit">הגדרות פרטיות ועוגיות</a></footer>
       <script>
         const hide = () => document.getElementById('banner')?.remove();
         if (document.cookie.includes('consent=')) hide();
         document.getElementById('accept').onclick = () => { document.cookie = 'consent=all; path=/'; hide(); };
         document.getElementById('reject').onclick = () => { document.cookie = 'consent=none; path=/'; hide(); };
       </script>`,
    ),
    // Compliant: nothing before consent, reject respected, revisit link present.
    'good.test': page(
      'אתר תקין',
      `<script>if (document.cookie.includes('consent=all')) { ${loadAnalytics} }</script>`,
      `<div id="banner" style="${BANNER_STYLE}">
         <p>נשמח להשתמש בעוגיות אנליטיקה. אפשר לאשר או לדחות.</p>
         <button id="accept">אישור הכל</button>
         <button id="reject">דחיית הכל</button>
       </div>
       <footer><a href="#" id="revisit">הגדרות פרטיות ועוגיות</a></footer>
       <script>
         const hide = () => document.getElementById('banner')?.remove();
         if (document.cookie.includes('consent=')) hide();
         document.getElementById('accept').onclick = () => {
           document.cookie = 'consent=all; path=/'; hide(); ${loadAnalytics}
         };
         document.getElementById('reject').onclick = () => { document.cookie = 'consent=none; path=/'; hide(); };
       </script>`,
    ),
    // Notice-only banner ("got it") while analytics already runs.
    'notice.test': page(
      'אתר עם הודעה בלבד',
      `<script>${loadAnalytics}</script>`,
      `<div id="banner" style="${BANNER_STYLE}">
         <p>באתר זה נעשה שימוש בעוגיות.</p>
         <button onclick="this.parentElement.remove()">הבנתי</button>
       </div>`,
    ),
  };
}

const GIF = Buffer.from('R0lGODlhAQABAAAAACw=', 'base64');

export interface FixtureServer {
  port: number;
  /** Paths requested directly on the loopback address (must stay empty: proxy blocks them). */
  loopbackHits: string[];
  close(): Promise<void>;
}

export async function startFixtureServer(): Promise<FixtureServer> {
  const loopbackHits: string[] = [];
  let port = 0;
  const server = http.createServer((req, res) => {
    const host = (req.headers.host ?? '').replace(/:\d+$/, '');
    const path = req.url ?? '/';
    if (host === '127.0.0.1' || host === 'localhost') {
      loopbackHits.push(path);
      res.end('internal');
      return;
    }
    if (host === 'analytics.test' && path.startsWith('/collect.js')) {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      res.end(`new Image().src = 'http://analytics.test/g/collect?v=2&tid=T-1&gcs=G111';`);
      return;
    }
    if (host === 'analytics.test' || host === 'ads.test') {
      res.writeHead(200, { 'content-type': 'image/gif' });
      res.end(GIF);
      return;
    }
    const html = sites(port)[host];
    if (!html || (path !== '/' && path !== '/#')) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
  return {
    port,
    loopbackHits,
    close: () =>
      new Promise((r) =>
        server.close(() => {
          r();
        }),
      ),
  };
}
