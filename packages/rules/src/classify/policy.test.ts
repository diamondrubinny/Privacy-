import { describe, expect, it } from 'vitest';
import { detectElements, findLastUpdated, hebrewRatio, parseDate } from './policy.js';

describe('parseDate', () => {
  it.each([
    ['01/03/2024', '2024-03-01'],
    ['1.3.24', '2024-03-01'],
    ['12/25/2024', '2024-12-25'],
    ['2025-10-01', '2025-10-01'],
    ['15 באוקטובר 2024', '2024-10-15'],
    ['אוגוסט 2025', '2025-08-01'],
    ['October 15, 2024', '2024-10-15'],
    ['no date here', null],
  ])('%s → %s', (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });
});

describe('findLastUpdated', () => {
  it('uses the date right after an update keyword', () => {
    expect(findLastUpdated('נוסד ב-2010. מדיניות זו עודכנה לאחרונה: 01/03/2024.')).toBe(
      '2024-03-01',
    );
    expect(findLastUpdated('Last updated: March 5, 2026')).toBe('2026-03-05');
    expect(findLastUpdated('נוסד ב-01/01/2010')).toBeNull();
  });
});

describe('detectElements', () => {
  it('detects Hebrew policy wording', () => {
    const text =
      'שופ בע"מ (ח.פ. 512345678) היא בעלת המאגר. המידע שנאסף כולל שם וטלפון, ישמש לצורך מתן השירות. ' +
      'אינך חייב על פי חוק למסור את המידע. נעביר מידע לספקים. ניתן לעיין במידע ולתקנו בפנייה ל-privacy@shop.co.il.';
    const found = detectElements(text);
    for (const id of [
      'controllerIdentity',
      'contact',
      'purposes',
      'dataCollected',
      'thirdParties',
      'rights',
      'legalObligation',
    ] as const) {
      expect([id, found.get(id)]).toEqual([id, true]);
    }
    expect(found.get('transferAbroad')).toBe(false);
    expect(found.get('retention')).toBe(false);
    expect(found.get('lastUpdated')).toBe(false);
  });
});

describe('hebrewRatio', () => {
  it('measures Hebrew vs Latin letters', () => {
    expect(hebrewRatio('שלום world')).toBeCloseTo(4 / 9);
    expect(hebrewRatio('123')).toBeNull();
  });
});

describe('findLastUpdated – regression', () => {
  it('ignores dates describing when a law took effect', () => {
    expect(
      findLastUpdated('תיקון 13 לחוק נכנס לתוקף מאוגוסט 2025 ובתוקף מ-14.08.2025.'),
    ).toBeNull();
    expect(findLastUpdated('Effective date: 2025-01-01')).toBe('2025-01-01');
  });
});
