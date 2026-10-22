/**
 * In-page consent banner detector.
 *
 * Kept as a plain JavaScript string (not a TS function) on purpose: Playwright serializes
 * functions with `toString()`, and TS/esbuild transforms can inject helpers (e.g. `__name`)
 * that do not exist inside the page. A string is evaluated exactly as written.
 *
 * Input: DetectorConfig (JSON). Output: FrameDetection (JSON).
 */

export interface CmpSignature {
  id: string;
  container: string;
  accept?: string;
  reject?: string;
  settings?: string;
  revisit?: string;
}

export interface DetectorConfig {
  markAttr: string;
  patterns: {
    accept: string;
    reject: string;
    settings: string;
    acknowledge: string;
    cookieContext: string;
    revisit: string;
    essentialLabel: string;
  };
  cmps: CmpSignature[];
}

export interface FrameButton {
  kind: 'accept' | 'reject' | 'settings' | 'acknowledge';
  text: string;
  source: 'cmp' | 'heuristic';
  marker: string;
}

export interface FrameDetection {
  found: boolean;
  cmp?: string;
  buttons: FrameButton[];
  precheckedLabels: string[];
  revisitControlFound: boolean;
}

export const BANNER_SCRIPT = String.raw`
(config) => {
  const re = {};
  for (const [k, v] of Object.entries(config.patterns)) re[k] = new RegExp(v, 'iu');
  let markerSeq = 0;

  const isVisible = (el) => {
    if (!(el instanceof Element)) return false;
    if (typeof el.checkVisibility === 'function' &&
        !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };

  const textOf = (el) => {
    const raw = (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '');
    return raw.replace(/\s+/g, ' ').trim().replace(/[.!\u00A0]+$/u, '');
  };

  // querySelectorAll that also walks open shadow roots.
  const deepQueryAll = (root, selector) => {
    const out = [];
    const walk = (node) => {
      out.push(...node.querySelectorAll(selector));
      for (const el of node.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(root);
    return out;
  };

  const classify = (text) => {
    if (!text || text.length > 60) return null;
    if (re.reject.test(text)) return 'reject';
    if (re.accept.test(text)) return 'accept';
    if (re.settings.test(text)) return 'settings';
    if (re.acknowledge.test(text)) return 'acknowledge';
    return null;
  };

  const mark = (el) => {
    const id = String(++markerSeq);
    el.setAttribute(config.markAttr, id);
    return id;
  };

  const CLICKABLE = 'button, a, [role="button"], input[type="button"], input[type="submit"]';

  // Markers from a previous run would make "[attr=N]" ambiguous; clear them first.
  for (const el of deepQueryAll(document, '[' + config.markAttr + ']')) el.removeAttribute(config.markAttr);

  // Returns candidate buttons without marking; markers are assigned only to the chosen container.
  const collectButtons = (container, source) => {
    const buttons = [];
    const seen = new Set();
    for (const el of deepQueryAll(container, CLICKABLE)) {
      if (!isVisible(el)) continue;
      const text = textOf(el);
      const kind = classify(text);
      if (!kind || seen.has(kind + text)) continue;
      seen.add(kind + text);
      buttons.push({ kind, text, source, el });
    }
    return buttons;
  };

  const finalize = (buttons) => buttons.map(({ el, ...rest }) => ({ ...rest, marker: mark(el) }));

  const precheckedIn = (container) => {
    const labels = [];
    for (const input of deepQueryAll(container, 'input[type="checkbox"]')) {
      if (!input.checked || input.disabled) continue;
      const label = (input.closest('label') && textOf(input.closest('label'))) ||
        (input.labels && input.labels[0] && textOf(input.labels[0])) ||
        input.getAttribute('aria-label') || input.name || input.id || '';
      if (re.essentialLabel.test(label)) continue;
      labels.push(label.slice(0, 80));
    }
    return labels;
  };

  const findRevisit = (exclude) => {
    for (const sig of config.cmps) {
      if (!sig.revisit) continue;
      for (const el of deepQueryAll(document, sig.revisit)) {
        if (!exclude || !exclude.contains(el)) return true;
      }
    }
    for (const el of deepQueryAll(document, CLICKABLE)) {
      if (exclude && exclude.contains(el)) continue;
      if (re.revisit.test(textOf(el))) return true;
    }
    return false;
  };

  // 1) Known CMPs.
  for (const sig of config.cmps) {
    const container = deepQueryAll(document, sig.container).find(isVisible);
    if (!container) continue;
    const buttons = [];
    for (const kind of ['accept', 'reject', 'settings']) {
      const sel = sig[kind];
      if (!sel) continue;
      const el = deepQueryAll(container, sel).find(isVisible);
      if (el) buttons.push({ kind, text: textOf(el), source: 'cmp', el });
    }
    // Fill gaps with the text heuristic inside the CMP container.
    for (const b of collectButtons(container, 'heuristic')) {
      if (!buttons.some((x) => x.kind === b.kind)) buttons.push(b);
    }
    return {
      found: true, cmp: sig.id, buttons: finalize(buttons),
      precheckedLabels: precheckedIn(container),
      revisitControlFound: findRevisit(container),
    };
  }

  // 2) Generic heuristic: a visible consent button inside an ancestor that talks about cookies.
  let best = null;
  const visited = new Set();
  for (const el of deepQueryAll(document, CLICKABLE)) {
    if (!isVisible(el)) continue;
    const kind = classify(textOf(el));
    if (kind !== 'accept' && kind !== 'acknowledge' && kind !== 'reject') continue;
    let node = el.parentElement;
    for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
      const t = (node.innerText || '').slice(0, 4000);
      if (t.length > 3000) break;
      if (re.cookieContext.test(t)) {
        if (visited.has(node)) break;
        visited.add(node);
        const buttons = collectButtons(node, 'heuristic');
        if (!best || buttons.length > best.buttons.length) best = { container: node, buttons };
        break;
      }
    }
  }
  if (best) {
    return {
      found: true, cmp: 'generic', buttons: finalize(best.buttons),
      precheckedLabels: precheckedIn(best.container),
      revisitControlFound: findRevisit(best.container),
    };
  }
  return { found: false, buttons: [], precheckedLabels: [], revisitControlFound: findRevisit(null) };
}
`;
