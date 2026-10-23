import { describe, expect, it } from 'vitest';
import { buildRobotsPolicy } from './robots.js';

const url = 'https://shop.co.il/robots.txt';

describe('buildRobotsPolicy', () => {
  it('applies the wildcard group and our bot-specific group', () => {
    const p = buildRobotsPolicy(
      url,
      200,
      'User-agent: *\nDisallow: /private\n\nUser-agent: PrivacyScanBot\nDisallow: /no-scan\n',
    );
    expect(p.isAllowed('https://shop.co.il/about')).toBe(true);
    expect(p.isAllowed('https://shop.co.il/no-scan/x')).toBe(false);
    // A specific group replaces "*" for that bot (RFC 9309).
    expect(p.isAllowed('https://shop.co.il/private')).toBe(true);
  });

  it('honors wildcard-only rules', () => {
    const p = buildRobotsPolicy(url, 200, 'User-agent: *\nDisallow: /secret\nAllow: /secret/ok\n');
    expect(p.isAllowed('https://shop.co.il/secret/x')).toBe(false);
    expect(p.isAllowed('https://shop.co.il/secret/ok')).toBe(true);
  });

  it('allows everything on 404 and nothing when unreachable', () => {
    expect(buildRobotsPolicy(url, 404, '').isAllowed('https://shop.co.il/a')).toBe(true);
    expect(buildRobotsPolicy(url, 503, '').isAllowed('https://shop.co.il/a')).toBe(false);
    expect(buildRobotsPolicy(url, null, '').isAllowed('https://shop.co.il/a')).toBe(false);
  });
});
