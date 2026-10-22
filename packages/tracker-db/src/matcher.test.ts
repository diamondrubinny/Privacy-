import { describe, expect, it } from 'vitest';
import { createDefaultMatcher, seedDataset, TrackerMatcher } from './index.js';

const matcher = createDefaultMatcher();

describe('TrackerMatcher – requests', () => {
  it('matches subdomains on a label boundary only', () => {
    expect(matcher.matchRequest('www.google-analytics.com', '/g/collect')?.entryId).toBe(
      'google-analytics',
    );
    expect(matcher.matchRequest('evilgoogle-analytics.com', '/g/collect')).toBeUndefined();
  });

  it('prefers path-specific entries on the same domain', () => {
    expect(matcher.matchRequest('www.googletagmanager.com', '/gtag/js')?.category).toBe(
      'analytics',
    );
    expect(matcher.matchRequest('www.googletagmanager.com', '/gtm.js')?.category).toBe(
      'functional',
    );
    expect(matcher.matchRequest('www.googletagmanager.com', '/other')).toBeUndefined();
  });

  it('distinguishes reCAPTCHA from Google Ads on google.com', () => {
    expect(matcher.matchRequest('www.google.com', '/recaptcha/api.js')?.entryId).toBe(
      'google-recaptcha',
    );
    expect(matcher.matchRequest('www.google.com', '/pagead/1p-user-list/1')?.category).toBe(
      'marketing',
    );
    expect(matcher.matchRequest('www.google.com', '/search')).toBeUndefined();
  });

  it('flags low-risk entries', () => {
    expect(matcher.matchRequest('plausible.io', '/api/event')?.lowRisk).toBe(true);
    expect(matcher.matchRequest('connect.facebook.net', '/en_US/fbevents.js')?.lowRisk).toBe(false);
  });
});

describe('TrackerMatcher – cookies', () => {
  it('matches exact and prefix names', () => {
    expect(matcher.matchCookie('_fbp')?.category).toBe('marketing');
    expect(matcher.matchCookie('_ga_ABC123')?.entryId).toBe('google-analytics');
    expect(matcher.matchCookie('_hjSessionUser_1')?.entryId).toBe('hotjar');
  });

  it('prefers the longest prefix (_gac_ is Ads, not Analytics)', () => {
    expect(matcher.matchCookie('_gac_UA-1')?.entryId).toBe('google-ads-cookies');
    expect(matcher.matchCookie('_gcl_au')?.category).toBe('marketing');
  });

  it('attributes the shared MUID cookie to Microsoft, not to a single product', () => {
    expect(matcher.matchCookie('MUID')?.entryId).toBe('ms-muid');
  });

  it('applies per-cookie category overrides', () => {
    expect(matcher.matchCookie('vuid')?.category).toBe('analytics');
  });

  it('returns undefined for unknown cookies', () => {
    expect(matcher.matchCookie('my_app_pref')).toBeUndefined();
  });
});

describe('dataset integrity', () => {
  it('has unique ids and valid regexes', () => {
    expect(() => new TrackerMatcher(seedDataset)).not.toThrow();
  });

  it('rejects duplicate ids', () => {
    const entry = { id: 'x', vendor: 'X', category: 'analytics' as const, domains: [] };
    expect(() => new TrackerMatcher({ version: 't', entries: [entry, entry] })).toThrow(
      /Duplicate/,
    );
  });

  it('uses lowercase domains without scheme or path', () => {
    for (const e of seedDataset.entries) {
      for (const d of e.domains) expect(d).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
    }
  });
});
