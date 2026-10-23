import type { FormEvidence, FormFieldEvidence } from '@privacyscan/shared';
import { describe, expect, it } from 'vitest';
import { classifyField, classifyForm, isBundledWithTerms, isMarketingConsent } from './fields.js';

const f = (
  hints: string,
  type = 'text',
  tag: FormFieldEvidence['tag'] = 'input',
): FormFieldEvidence => ({
  tag,
  type,
  hints,
  autocomplete: '',
  required: false,
});

const form = (fields: FormFieldEvidence[]): FormEvidence => ({
  pageUrl: 'https://x.co.il/',
  index: 0,
  kind: 'form',
  visible: true,
  method: 'post',
  fields,
  checkboxes: [],
  contextText: '',
  contextLinks: [],
});

describe('classifyField', () => {
  it.each([
    ['שם מלא | fullname', 'name'],
    ['טלפון נייד', 'phone'],
    ['כתובת דוא"ל', 'email'],
    ['מספר ת.ז', 'idNumber'],
    ['תעודת זהות', 'idNumber'],
    ['תאריך לידה', 'birthDate'],
    ['פרטים רפואיים רלוונטיים', 'health'],
    ['עבר פלילי', 'specialCategory'],
    ['מספר כרטיס אשראי', 'financial'],
    ['כתובת מגורים | street-address', 'address'],
    ['חיפוש באתר', 'search'],
    ['company', 'other'],
  ])('%s → %s', (hints, kind) => {
    expect(classifyField(f(hints))).toBe(kind);
  });

  it('uses input types as fallback', () => {
    expect(classifyField(f('', 'email'))).toBe('email');
    expect(classifyField(f('', 'tel'))).toBe('phone');
    expect(classifyField(f('', 'password'))).toBe('password');
    expect(classifyField(f('הודעה', 'textarea', 'textarea'))).toBe('freeText');
  });
});

describe('classifyForm', () => {
  it('recognizes search and login forms as non-collecting', () => {
    expect(classifyForm(form([f('חיפוש', 'search')])).purpose).toBe('search');
    const login = classifyForm(form([f('email', 'email'), f('סיסמה', 'password')]));
    expect(login.purpose).toBe('login');
    expect(login.personal).toBe(false);
  });

  it('marks contact forms as personal', () => {
    const c = classifyForm(form([f('שם'), f('טלפון', 'tel'), f('הודעה', 'textarea', 'textarea')]));
    expect(c).toMatchObject({
      purpose: 'collect',
      personal: true,
      kinds: ['name', 'phone', 'freeText'],
    });
  });
});

describe('consent checkboxes', () => {
  it('detects marketing and bundled consents', () => {
    const mk = { label: 'אני מאשר/ת קבלת דיוור ומבצעים', checked: false, required: false };
    const bundled = {
      label: 'קראתי ואני מסכים לתקנון ולקבלת עדכונים',
      checked: false,
      required: true,
    };
    const terms = { label: 'קראתי את מדיניות הפרטיות', checked: false, required: true };
    expect(isMarketingConsent(mk)).toBe(true);
    expect(isBundledWithTerms(mk)).toBe(false);
    expect(isBundledWithTerms(bundled)).toBe(true);
    expect(isMarketingConsent(terms)).toBe(false);
  });
});

describe('regressions from real sites', () => {
  it("does not treat a domain search box as a person's name", () => {
    expect(classifyField(f('שם דומיין | domain'))).toBe('other');
    expect(classifyForm(form([f('הקלידו שם דומיין')])).personal).toBe(false);
  });

  it('treats a password-reset form as account handling, not data collection', () => {
    const reset = {
      ...form([f('email', 'email')]),
      contextText: 'שכחת סיסמה? הזינו את כתובת הדוא"ל',
    };
    expect(classifyForm(reset).purpose).toBe('login');
    expect(classifyForm(form([f('email', 'email')])).personal).toBe(true);
  });
});
