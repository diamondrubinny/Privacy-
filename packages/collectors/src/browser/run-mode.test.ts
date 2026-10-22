import { createDefaultMatcher } from '@privacyscan/tracker-db';
import { describe, expect, it } from 'vitest';
import { cookiePhase, registrableDomain, toRequestRecord } from './run-mode.js';

const matcher = createDefaultMatcher();
const meta = { resourceType: 'image', method: 'GET' };

describe('toRequestRecord', () => {
  it('keeps only parameter names, plus a valid Consent Mode flag', () => {
    const r = toRequestRecord(
      'https://region1.google-analytics.com/g/collect?v=2&tid=G-ABC&cid=123.456&uid=user%40mail.com&gcs=G100',
      meta,
      'pre-action',
      'shop.co.il',
      matcher,
    );
    expect(r).toMatchObject({
      origin: 'https://region1.google-analytics.com',
      path: '/g/collect',
      queryKeys: ['v', 'tid', 'cid', 'uid', 'gcs'],
      consentSignal: 'G100',
      thirdParty: true,
      tracker: { vendor: 'Google Analytics', category: 'analytics' },
    });
    expect(JSON.stringify(r)).not.toMatch(/G-ABC|123\.456|mail\.com/);
  });

  it('drops malformed consent flags and non-http URLs', () => {
    const r = toRequestRecord('https://x.com/a?gcs=<script>', meta, 'pre-action', 'x.com', matcher);
    expect(r?.consentSignal).toBeUndefined();
    expect(r?.thirdParty).toBe(false);
    expect(
      toRequestRecord('data:image/png;base64,AAAA', meta, 'pre-action', 'x.com', matcher),
    ).toBeNull();
  });

  it('truncates long paths', () => {
    const r = toRequestRecord(
      `https://x.com/${'a'.repeat(500)}`,
      meta,
      'pre-action',
      'x.com',
      matcher,
    );
    expect(r?.path.length).toBe(200);
  });
});

describe('registrableDomain', () => {
  it('uses the public suffix list', () => {
    expect(registrableDomain('www.shop.co.il')).toBe('shop.co.il');
    expect(registrableDomain('.cdn.example.com')).toBe('example.com');
  });
});

describe('cookiePhase', () => {
  const c = (expires: number) => ({ name: '_ga', domain: '.x.com', path: '/', expires });
  const snap = (expires?: number) =>
    new Map(expires === undefined ? [] : [['_ga|.x.com|/', expires]]);

  it('is pre-action in baseline', () => {
    expect(cookiePhase(c(100), undefined, undefined)).toBe('pre-action');
  });

  it('detects creation and rewrites per phase', () => {
    expect(cookiePhase(c(100), snap(100), snap(100))).toBe('pre-action');
    expect(cookiePhase(c(200), snap(), snap(200))).toBe('post-action');
    expect(cookiePhase(c(300), snap(100), snap(200))).toBe('post-reload');
    expect(cookiePhase(c(300), snap(), snap())).toBe('post-reload');
    expect(cookiePhase(c(200), snap(100), undefined)).toBe('post-action');
  });

  it('cannot see rewrites of session cookies', () => {
    expect(cookiePhase(c(-1), snap(-1), snap(-1))).toBe('pre-action');
  });
});
