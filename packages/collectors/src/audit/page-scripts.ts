/**
 * In-page collectors, kept as plain JavaScript strings (see banner-script.ts for why).
 * They read DOM structure and visible text only — never form values.
 */

export interface PageInfo {
  lang: string;
  title: string;
  hebrewRatio: number | null;
  links: { url: string; text: string; inFooter: boolean }[];
  insecureResources: string[];
}

export const PAGE_INFO_SCRIPT = String.raw`(() => {
  const text = (document.body ? document.body.innerText : '').slice(0, 50000);
  const he = (text.match(/[֐-׿]/g) || []).length;
  const la = (text.match(/[A-Za-z]/g) || []).length;
  const links = [];
  for (const a of document.querySelectorAll('a[href]')) {
    if (links.length >= 500) break;
    const t = (a.innerText || a.getAttribute('aria-label') || a.getAttribute('title') || '')
      .replace(/\s+/g, ' ').trim().slice(0, 120);
    links.push({ url: a.href, text: t, inFooter: !!a.closest('footer, [role="contentinfo"]') });
  }
  // Mixed content from the DOM: Chromium auto-upgrades or blocks it, so requests alone miss it.
  const insecure = [];
  if (location.protocol === 'https:') {
    // Form targets are excluded here: FORM-INSECURE-SUBMIT reports them with more context.
    const sel = '[src^="http:"], link[rel~="stylesheet"][href^="http:"], object[data^="http:"]';
    for (const el of document.querySelectorAll(sel)) {
      if (insecure.length >= 20) break;
      const raw = el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('data') || '';
      try { const u = new URL(raw); insecure.push(u.origin + u.pathname.slice(0, 200)); } catch (e) {}
    }
  }
  return {
    lang: (document.documentElement.getAttribute('lang') || '').slice(0, 20),
    title: (document.title || '').slice(0, 200),
    hebrewRatio: he + la === 0 ? null : Math.round((he / (he + la)) * 1000) / 1000,
    links,
    insecureResources: insecure,
  };
})()`;

export interface PolicyText {
  lang: string;
  text: string;
  truncated: boolean;
}

export const POLICY_TEXT_LIMIT = 100_000;

export const POLICY_TEXT_SCRIPT = String.raw`(() => {
  const root = document.querySelector('main, article, [role="main"]') || document.body;
  const raw = (root ? root.innerText : '') || '';
  const text = raw.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return {
    lang: (document.documentElement.getAttribute('lang') || '').slice(0, 20),
    text: text.slice(0, ${POLICY_TEXT_LIMIT}),
    truncated: text.length > ${POLICY_TEXT_LIMIT},
  };
})()`;

export interface RawForm {
  kind: 'form' | 'implicit';
  visible: boolean;
  action: string | null;
  method: string;
  fields: {
    tag: 'input' | 'select' | 'textarea';
    type: string;
    hints: string;
    autocomplete: string;
    required: boolean;
  }[];
  checkboxes: { label: string; checked: boolean; required: boolean }[];
  contextText: string;
  contextLinks: { url: string; text: string }[];
}

export const FORMS_SCRIPT = String.raw`(() => {
  const clean = (s, n) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'image', 'reset']);

  const labelOf = (el) => {
    const parts = [];
    if (el.labels) for (const l of el.labels) parts.push(l.innerText);
    const wrap = el.closest('label');
    if (wrap && !parts.length) parts.push(wrap.innerText);
    const by = el.getAttribute('aria-labelledby');
    if (by) for (const id of by.split(/\s+/)) {
      const t = document.getElementById(id);
      if (t) parts.push(t.innerText);
    }
    return clean(parts.join(' '), 200);
  };

  const isVisible = (el) => {
    if (typeof el.checkVisibility === 'function') {
      return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // Notices usually sit next to the form: climb a few levels while the text stays short, never into
  // <body>/<html> and never past a landmark (otherwise a site-wide footer link would count as a notice).
  const LANDMARK = /^(MAIN|FOOTER|HEADER|ASIDE|SECTION|ARTICLE|NAV|DIALOG)$/;
  const contextOf = (el) => {
    let node = el;
    let best = el;
    for (let i = 0; i < 3 && !LANDMARK.test(node.tagName); i++) {
      const parent = node.parentElement;
      if (!parent || parent === document.body || parent === document.documentElement) break;
      if ((parent.innerText || '').length > 1500) break;
      node = parent;
      best = node;
    }
    const links = [];
    for (const a of best.querySelectorAll('a[href]')) {
      if (links.length >= 20) break;
      links.push({ url: a.href, text: clean(a.innerText || a.getAttribute('aria-label'), 120) });
    }
    return { text: clean(best.innerText, 1500), links };
  };

  const CAPTCHA = /captcha|turnstile/i;
  const describe = (container, kind, controls) => {
    const fields = [];
    const checkboxes = [];
    const radios = new Set();
    // In a visible form, hidden controls are honeypots or widget internals (e.g. reCAPTCHA's textarea).
    const containerVisible = isVisible(container);
    for (const el of controls) {
      if (CAPTCHA.test(el.name || '') || CAPTCHA.test(el.id || '')) continue;
      if (containerVisible && el.type !== 'checkbox' && !isVisible(el)) continue;
      const tag = el.tagName.toLowerCase();
      const type = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : tag;
      if (SKIP_TYPES.has(type)) continue;
      const required = el.required || el.getAttribute('aria-required') === 'true';
      if (type === 'checkbox') {
        checkboxes.push({ label: labelOf(el) || clean(el.name, 80), checked: el.defaultChecked || el.checked, required });
        continue;
      }
      if (type === 'radio') {
        if (radios.has(el.name)) continue;
        radios.add(el.name);
      }
      const hints = clean([labelOf(el), el.getAttribute('aria-label'), el.getAttribute('placeholder'),
        el.name, el.id, el.getAttribute('autocomplete')].filter(Boolean).join(' | '), 200);
      fields.push({ tag, type, hints, autocomplete: clean(el.getAttribute('autocomplete'), 40), required });
    }
    if (!fields.length && !checkboxes.length) return null;
    const ctx = contextOf(container);
    return {
      kind,
      visible: isVisible(container),
      action: kind === 'form' ? container.action || null : null,
      method: kind === 'form' ? (container.method || 'get').toLowerCase() : 'unknown',
      fields: fields.slice(0, 60),
      checkboxes: checkboxes.slice(0, 20),
      contextText: ctx.text,
      contextLinks: ctx.links,
    };
  };

  const out = [];
  for (const form of document.querySelectorAll('form')) {
    if (out.length >= 30) break;
    const d = describe(form, 'form', form.querySelectorAll('input, select, textarea'));
    if (d) out.push(d);
  }

  // Implicit forms (JS frameworks): visible inputs outside <form>, grouped by a container with a button.
  const orphans = [...document.querySelectorAll('input, select, textarea')].filter((el) => !el.form && !el.closest('form'));
  const groups = new Map();
  for (const el of orphans) {
    let node = el.parentElement;
    for (let i = 0; node && i < 6; i++, node = node.parentElement) {
      if (node.querySelector('button, [type="submit"], [role="button"]')) break;
    }
    const key = node || el.parentElement || document.body;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(el);
  }
  for (const [container, controls] of groups) {
    if (out.length >= 40) break;
    const d = describe(container, 'implicit', controls);
    if (d) out.push(d);
  }
  return out;
})()`;
