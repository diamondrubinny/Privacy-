import { describe, expect, it } from 'vitest';
import { classifyLinks } from './links.js';

const base = 'https://www.shop.co.il/';
const l = (url: string, text: string) => ({ url, text });

describe('classifyLinks', () => {
  it('finds Hebrew legal links and prefers text over URL matches', () => {
    const r = classifyLinks(
      [
        l('/privacy-old', 'משהו'),
        l('/%D7%9E%D7%93%D7%99%D7%A0%D7%99%D7%95%D7%AA', 'מדיניות הפרטיות'),
        l('/accessibility', 'הצהרת נגישות'),
        l('/takanon', 'תקנון האתר'),
        l('/contact', 'צור קשר'),
      ],
      base,
      'shop.co.il',
    );
    expect(r.legal.privacy?.text).toBe('מדיניות הפרטיות');
    expect(r.legal.accessibility?.url).toBe('https://www.shop.co.il/accessibility');
    expect(r.legal.terms?.url).toBe('https://www.shop.co.il/takanon');
    expect(r.legal.contact?.url).toBe('https://www.shop.co.il/contact');
  });

  it('ignores consent-revisit controls and self links', () => {
    const r = classifyLinks(
      [
        l('#', 'הגדרות פרטיות ועוגיות'),
        l('/', 'Privacy'),
        l('javascript:void(0)', 'מדיניות פרטיות'),
      ],
      base,
      'shop.co.il',
    );
    expect(r.legal.privacy).toBeUndefined();
  });

  it('keeps off-site legal links but crawls same-site only', () => {
    const r = classifyLinks(
      [
        l('https://app.termly.io/policy/123', 'Privacy Policy'),
        l('https://facebook.com/shop', 'Facebook'),
        l('/register', 'הרשמה'),
        l('/about', 'אודות'),
        l('/about#team', 'הצוות'),
      ],
      base,
      'shop.co.il',
    );
    expect(r.legal.privacy?.url).toBe('https://app.termly.io/policy/123');
    expect(r.formCandidates.map((x) => x.url)).toEqual(['https://www.shop.co.il/register']);
    expect(r.others.map((x) => x.url)).toEqual(['https://www.shop.co.il/about']);
  });
});

describe('classifyLinks – regression: product names containing "מדיניות פרטיות"', () => {
  it('prefers the exact footer link over a product page with the phrase inside its name', () => {
    const r = classifyLinks(
      [
        { url: '/privacy-scanner', text: 'סורק מדיניות פרטיות', inFooter: false },
        { url: '/privacy-policy', text: 'מדיניות פרטיות', inFooter: true },
      ],
      base,
      'shop.co.il',
    );
    expect(r.legal.privacy?.url).toBe('https://www.shop.co.il/privacy-policy');
  });
});
