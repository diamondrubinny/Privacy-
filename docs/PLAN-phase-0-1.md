# תוכנית עבודה — שלב 0 + שלב 1

> מאושר על ידי המשתמש: 2026-10-22. מקור: [`SPEC.md`](SPEC.md) סעיף 14.

## יעד

```
pnpm scan https://example.co.il --pretty
```

הפקודה מחזירה JSON עם ראיות (בקשות רשת, עוגיות, באנר) משלושה מצבי דפדפן, מלאי עוגיות ו-trackers, וממצאי `CK-*`.

## החלטות גרסה (נבדקו מול npm ב-2026-10-22)

| כלי | גרסה | הערה |
|-----|------|------|
| Node | 22 LTS | `.nvmrc` |
| pnpm | 10.28 | `packageManager` |
| TypeScript | 6.0.3 | TS 7.0 (native) עדיין לא נתמך ב-typescript-eslint (`<6.1.0`) |
| playwright-core | 1.64.1 | נבדק מול Chromium 141 המותקן מראש. ב-Docker: אימג' Playwright תואם |
| vitest | 5.0.5 | |
| ESLint | 10 + typescript-eslint 8.72 | flat config |
| tldts | 7.x | זיהוי eTLD+1 (צד ראשון / שלישי) |
| ipaddr.js | 2.x | סיווג טווחי IP ל-SSRF |
| zod | 4.x | ולידציית קלט CLI ו-API |

## מבנה

```
apps/worker            CLI (שלב 1) → BullMQ consumer (שלב 3)
packages/shared        types + zod schemas
packages/tracker-db    seed dataset + matcher
packages/collectors    net/ (SSRF guard + egress proxy), browser/ (modes, banner)
packages/rules         CK-* rules + engine
test/fixtures          אתרי בדיקה מבוימים (good / bad)
```

## הגנת SSRF (שתי שכבות)

1. **`assertPublicUrl`**: רק http/https, פורטים 80/443, בלי credentials ב-URL. כל כתובות ה-DNS חייבות להיות unicast ציבורי (כולל IPv4-mapped IPv6).
2. **Egress proxy פנימי**: Chromium מוגדר לעבור *רק* דרכו, כולל loopback (`<-loopback>`), עם QUIC כבוי ו-WebRTC מוגבל ל-proxy. ה-proxy פותר DNS, בודק את הכתובת, **ומתחבר ל-IP שנבדק**. כך נחסם DNS rebinding.
3. בפרודקשן: חומת אש ברשת ה-container (מעבר לקוד, ראו SPEC §11).

## מצבי דפדפן

| מצב | שלבים | נשמר |
|-----|-------|------|
| baseline | load → settle | requests, cookies, storage keys, banner |
| reject | load → זיהוי באנר → קליק "דחייה" → settle → reload → settle | הכול, מסומן `pre-action` / `post-action` |
| accept | כנ"ל עם "אישור" | כנ"ל |

**מזעור מידע:** ערכי עוגיות ו-storage לא נשמרים. מכתובות URL נשמרים origin + path + **שמות** פרמטרים בלבד.

## כללים בשלב 1

`CK-PRECONSENT`, `CK-REJECT-IGNORED`, `CK-NO-BANNER`, `CK-NO-REJECT`, `CK-NOTICE-ONLY`, `CK-PRECHECKED`, `CK-NO-REVISIT`, `CK-LONG-RETENTION`

## בדיקות

- יחידה: IP/URL policy, matcher, כל כלל עם evidence סינתטי.
- אינטגרציה: proxy חוסם `127.0.0.1` ו-`169.254.169.254`, ו-rebinding.
- E2E: סריקה של fixture "bad" ו-"good" דרך ה-proxy עם מיפוי hosts לבדיקות → ממצאים צפויים.

## מחוץ לתכולה (שלב 2+)

crawler + robots.txt, collectors של forms/policy/security/a11y, importer ל-Open Cookie Database, GeoIP, צילומי מסך בדוח.

---

## תוצאות (2026-10-22)

**סטטוס: הושלם.** lint, typecheck ו-format נקיים. 99 בדיקות עוברות (unit + E2E עם Chromium). `pnpm audit`: אין חולשות ידועות.

### אימות מול אתרים אמיתיים (מהסביבה, IP מחוץ לישראל)

| אתר | תוצאה | אימות |
|-----|-------|-------|
| onetrust.com | באנר OneTrust זוהה ("Essential only" / "Stay opted-in"). Clarity ו-Bing UET ממשיכים אחרי דחייה | צילום מסך + ראיות `post-reload` |
| cookiebot.com | לא מוצג באנר למבקר מארה"ב (מודל US), רק ווידג'ט | צילום מסך. ממחיש את **מגבלת המיקום** |
| ynet.co.il | 12 כלים לפני הסכמה, לא זוהה באנר | לא אומת ממיקום ישראלי |

### שינויים מהתוכנית בעקבות הבדיקות

1. **שלב `post-reload` חדש:** `CK-REJECT-IGNORED` מתבסס רק על הצפייה אחרי הרענון. beacons של סקריפטים שכבר רצו בין הלחיצה לרענון גרמו ל-false positives.
2. **באג בזיהוי באנר:** markers נדרסו כשאותו container נסרק פעמיים. תוקן ונוספה בדיקה.
3. **`MUID`** מסווג כ-"Microsoft (Bing Ads / Clarity)" ולא כ-Bing בלבד.
4. **אימות ל-proxy הפנימי הוסר:** המדיניות נאכפת על כל בקשה, וה-proxy מאזין רק ל-127.0.0.1.
5. **MinIO הוסר מ-docker-compose:** לא נמצא אימג' מתוחזק שאומת. יוחלט בשלב 4.

### הערת סביבת פיתוח

ב-sandbox הנוכחי, Chromium 156 (באימג' Docker) מול ה-proxy המיירט של הסביבה מחזיר `ERR_TOO_MANY_RETRIES`, גם **בלי** הקוד שלנו (נבדק ישירות). Chromium 141 על ה-host עובד. בפרודקשן יש יציאה ישירה לאינטרנט, ולכן הבעיה לא רלוונטית שם.

### פתוח לשלב 2

- **Chromium sandbox:** Playwright מריץ ברירת מחדל עם `--no-sandbox`. ההגנה כרגע היא בידוד ה-container. יש להפעיל `chromiumSandbox: true` עם פרופיל seccomp.
- **Egress firewall ברמת רשת** ב-deployment (שכבה שלישית).
- **סריקה ממיקומים IL/EU** + שדה מיקום בדוח.
- crawler + robots.txt, collectors של forms/policy/security/a11y, importer ל-Open Cookie Database.
