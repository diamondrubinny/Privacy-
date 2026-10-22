# PrivacyScan IL — אפיון MVP

> **סטטוס:** טיוטת אפיון v0.1 (2026-10-22). ממתינה לאישור לפני תחילת פיתוח.
> **הבהרה:** המערכת היא כלי עזר טכני לזיהוי סיכונים. היא **אינה** ייעוץ משפטי ואינה מאשרת עמידה בחוק. כל מקום שמסומן "דורש אימות" חייב בדיקה מול נוסח החוק, התקנות וההנחיות הרשמיות של הרשות להגנת הפרטיות, ובדיקה של עו"ד.

---

## 1. סיכום ההבנה

אנחנו בונים מערכת SaaS שסורקת אתר לפי כתובת URL ומפיקה דוח בעברית (RTL). הדוח מצביע על פערים מול:

- **חוק הגנת הפרטיות, התשמ"א-1981, כפי שתוקן בתיקון 13.** התיקון בתוקף מ-14.08.2025 (דורש אימות).
- **GDPR**, לאתרים שפונים לתושבי האיחוד האירופי.
- **עוגיות והסכמה**: האם סקריפטים לא-חיוניים נטענים לפני הסכמה, ובאיזו איכות בנוי באנר העוגיות.
- **אבטחת מידע בסיסית** שאפשר למדוד מבחוץ: HTTPS, כותרות אבטחה ודגלי עוגיות.
- **נגישות בסיסית**: הצהרת נגישות ובדיקה אוטומטית לפי WCAG 2.1 AA / ת"י 5568.
- **חוק התקשורת, סעיף 30א ("חוק הספאם")**: תיבות הסכמה לדיוור בטפסים.

**הבידול מול מתחרים:** box.co.il מציע סריקה חינמית של 4 בדיקות, בלי ציון ובלי פירוט. privacy13 ו-trio-cyber מוכרים שירות ייעוץ. אצלנו:

1. **בדיקה דינמית אמיתית.** המערכת מריצה דפדפן ומשווה מה נטען לפני הסכמה, אחרי "דחייה" ואחרי "אישור". לא מסתפקים בבדיקה ש"יש באנר".
2. **ממצאים עם ראיות.** כל ממצא מגיע עם בקשת רשת, עוגייה או צילום מסך, וכל ממצא מקושר לכלל שיש לו מספר גרסה.
3. **מעקב לאורך זמן.** סריקה חוזרת מתוזמנת והתראה כשמשהו משתנה, למשל כשמופיע pixel חדש.
4. **מלאי אוטומטי.** המערכת מייצרת Cookie/Tracker Inventory ורשימת ספקי צד שלישי, ואלה משמשים בסיס למדיניות העוגיות ולמסמך מיפוי המידע.

## 2. הנחות עבודה ושאלות פתוחות

### הנחות

| # | הנחה |
|---|------|
| H1 | קהל היעד: בעלי עסקים קטנים ובינוניים בישראל, סוכנויות דיגיטל ויועצי פרטיות. |
| H2 | סריקה פסיבית בלבד. המערכת טוענת דפים ציבוריים כמו גולש רגיל, בלי ניסיונות חדירה ובלי שליחת טפסים. |
| H3 | סריקה בסיסית (עד 20 דפים) פתוחה לכל אתר. סריקה עמוקה, ניטור קבוע ודוח מלא מחייבים **אימות בעלות על הדומיין** (DNS TXT או קובץ). |
| H4 | MVP: ממשק בעברית בלבד. התשתית מוכנה ל-i18n (אנגלית בהמשך). |
| H5 | בשלב ה-MVP אין שימוש ב-LLM לניתוח מדיניות הפרטיות, רק בכללים דטרמיניסטיים. LLM יתווסף כאופציה שהמשתמש בוחר בה, אחרי בדיקת DPA מול הספק. |
| H6 | רישיון קנייני (All Rights Reserved). אפשר לשנות לרישיון קוד פתוח בהמשך. ההחלטה ההפוכה לא הפיכה. |

### שאלות פתוחות (לא חוסמות את האפיון)

1. מודל עסקי: Freemium (סריקה חינם ודוח מלא בתשלום) או מנוי בלבד? לפי זה ייקבע האם צריך אינטגרציית סליקה ב-MVP.
2. האם הכלי יכלול גם **תיקון**: מחולל מדיניות פרטיות וקוד באנר עוגיות להטמעה? מומלץ רק בשלב 3.
3. White-label לסוכנויות (לוגו ודומיין משלהן)? משפיע על מודל ה-Tenants כבר עכשיו.
4. שם המוצר והישות המשפטית (לכותרת הרישיון ולמסמכים המשפטיים).
5. האם נדרשת סריקה של אפליקציות מובייל? לא נכלל ב-MVP.

## 3. מסגרת משפטית → כללי סריקה

> הטבלה ממפה דרישה לבדיקה טכנית. הניסוח המשפטי מבוסס על מקורות משניים. **כל שורה דורשת אימות מול נוסח החוק ברשומות ומול מדריך הרשות (gov.il/he/pages/guide_tikon13_professional).**

| מקור | דרישה (תמצית) | מה ניתן לבדוק מבחוץ | מזהה כלל |
|------|---------------|--------------------|---------|
| חוק הגנת הפרטיות ס' 11 (חובת יידוע) | בעת איסוף מידע יש ליידע: האם יש חובה חוקית למסור, המטרה, למי יימסר המידע | טקסט יידוע או קישור למדיניות ליד כל טופס שאוסף מידע אישי | `IL-NOTICE-FORM` |
| ס' 8, עקרון צמידות המטרה | שימוש במידע רק למטרה שלשמה נאסף | חלקי: האם המדיניות מפרטת מטרות | `IL-POLICY-PURPOSE` |
| תיקון 13, הגדרת "מידע בעל רגישות מיוחדת" | הגנה מוגברת (בריאות, ביומטרי, גנטי, מוצא, דעות, עבר פלילי, מיקום וכו') | שדות טופס שמבקשים מידע רגיש (ת"ז, מצב רפואי, תאריך לידה וכו') | `IL-SENSITIVE-FIELDS` |
| תקנות אבטחת מידע, התשע"ז-2017 | אבטחה סבירה של המאגר | HTTPS, TLS ≥1.2, HSTS, mixed content, דגלי עוגיות | `SEC-*` |
| תיקון 13, ממונה הגנת פרטיות (DPO) | חובה רק לגופים מסוימים (גופים ציבוריים, סוחרי מידע, ניטור שיטתי בהיקף ניכר, עיבוד מידע רגיש בהיקף ניכר) | לא נבדק אוטומטית. שאלון מנחה בדוח + בדיקה אם המדיניות מציינת פרטי קשר של DPO | `IL-DPO-HINT` |
| העברת מידע לחו"ל (תקנות העברת מידע) | תנאים להעברה | רשימת ספקים צד שלישי + מדינות שרתים (GeoIP) | `XFER-VENDORS` |
| GDPR Art. 13 | פרטי בקר, מטרות, בסיס חוקי, נמענים, העברות, תקופת שמירה, זכויות, תלונה לרשות | ניתוח מדיניות לפי רשימת רכיבים | `GDPR-ART13-*` |
| ePrivacy (Art. 5(3)) + EDPB Guidelines 03/2022 על dark patterns | אין עוגיות לא-חיוניות לפני הסכמה. דחייה קלה כמו אישור. אין סימון מראש | בדיקה דינמית של 3 מצבים | `CK-*` |
| חוק התקשורת ס' 30א | דיוור רק בהסכמה מפורשת | תיבת הסכמה לדיוור שמסומנת מראש או שלא קיימת | `SPAM-OPTIN` |
| תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), 2013 + ת"י 5568 | נגישות אתר + הצהרת נגישות | axe-core + חיפוש עמוד הצהרת נגישות | `A11Y-*` |

**לגבי עוגיות בישראל:** בדין הישראלי אין היום הסדר ייעודי לעוגיות שמקביל ל-ePrivacy. לכן כללי `CK-*` מסומנים בדוח כ"נדרש לפי GDPR / פרקטיקה מומלצת בישראל", ולא כ"הפרת החוק הישראלי". צריך לבדוק אם הרשות פרסמה הנחיה בנושא (דורש אימות).

**עיצומים:** בדוח לא יופיעו סכומי קנס ספציפיים. המקורות סותרים זה את זה (למשל 150K, 320K, 640K ו-3.2M ₪), ולכן הדוח יפנה למדריך הרשות. זה מונע הפחדה מטעה.

## 4. User Stories

| ID | כ... | אני רוצה... | כדי ש... |
|----|------|-------------|----------|
| US1 | מבקר אנונימי | להזין URL ולקבל תקציר סיכונים תוך דקה | אבין אם יש לי בעיה |
| US2 | משתמש רשום | לאמת בעלות על הדומיין שלי | אקבל סריקה עמוקה ודוח מלא |
| US3 | משתמש רשום | לראות לכל ממצא: מה נמצא, ראיה, למה זה חשוב, איך לתקן | אוכל להעביר למפתח |
| US4 | משתמש רשום | להוריד דוח PDF בעברית | אעביר לעו"ד או להנהלה |
| US5 | משתמש רשום | לקבל Cookie Inventory (CSV/JSON) | אעדכן מדיניות עוגיות |
| US6 | משתמש רשום | לתזמן סריקה שבועית ולקבל התראה על שינוי | אדע כשנוסף tracker חדש |
| US7 | סוכנות | לנהל כמה אתרים של לקוחות בארגון אחד, עם משתמשים והרשאות | אנהל תיק לקוחות |
| US8 | אדמין מערכת | לעדכן כללים וגרסאות מאגר trackers | הדוחות יישארו עדכניים |
| US9 | כל משתמש | למחוק את החשבון ואת כל הסריקות | זכות מחיקה |

## 5. מסכים וזרימות

1. **דף בית**: שדה URL, CAPTCHA, הסבר קצר, הבהרה משפטית.
2. **מסך התקדמות סריקה**: שלבים בזמן אמת (SSE). מוכרז ב-`aria-live`.
3. **תקציר תוצאות (ציבורי)**: רמת סיכון לפי קטגוריה ו-3 ממצאים עיקריים. קריאה להירשם לדוח המלא.
4. **הרשמה / התחברות**: Magic link או סיסמה. MFA (TOTP) לארגונים.
5. **דשבורד**: אתרים, סריקה אחרונה, מגמה.
6. **אימות דומיין**: הוראות DNS TXT או קובץ `/.well-known/privacyscan-verify.txt`.
7. **דוח מלא**: לשוניות לפי קטגוריה (עוגיות, מדיניות, טפסים, אבטחה, נגישות, ספקים), עם פילטר לפי חומרה.
8. **פרטי ממצא**: ראיה (בקשת רשת, עוגייה, צילום מסך), הסבר, המלצה, מקור משפטי + "דורש אימות".
9. **Inventory**: טבלת עוגיות וטבלת ספקים, עם ייצוא.
10. **הגדרות ארגון**: משתמשים, תפקידים, תזמון, התראות, מחיקת חשבון.
11. **עמודים משפטיים**: מדיניות פרטיות, עוגיות, תנאי שימוש, הצהרת נגישות, וקישור "הגדרות פרטיות ועוגיות".
12. **404 / Error**.

**זרימת סריקה:**
`URL → ולידציה + SSRF guard → תור → Worker: crawl (sitemap + קישורי footer) → לכל דף נבחר: 3 מצבי דפדפן (baseline / reject / accept) → איסוף ראיות → Rule engine → ציון סיכון → אחסון → דוח`

## 6. ארכיטקטורה

```
┌──────────────┐    HTTPS    ┌───────────────────────┐
│  Next.js 15  │────────────▶│  API (Next.js Route   │
│  (RTL UI)    │◀────SSE─────│  Handlers / tRPC-free)│
└──────────────┘             └──────────┬────────────┘
                                        │ enqueue
                             ┌──────────▼───────────┐
                             │ Redis + BullMQ       │
                             └──────────┬───────────┘
                                        │
             ┌──────────────────────────▼─────────────────────────┐
             │ Scanner Worker (Node + Playwright/Chromium)         │
             │  • container מבודד, ללא גישה לרשת פנימית            │
             │  • egress proxy עם חסימת RFC1918/metadata           │
             │  • collectors → evidence → rule engine              │
             └──────────┬───────────────────────────┬─────────────┘
                        │                           │
              ┌─────────▼────────┐        ┌─────────▼─────────┐
              │ PostgreSQL       │        │ Object storage    │
              │ (Prisma)         │        │ (screenshots/PDF, │
              └──────────────────┘        │  private, SSE-KMS)│
                                          └───────────────────┘
```

**Monorepo (pnpm workspaces):**

```
apps/
  web/            # Next.js – UI + API routes
  worker/         # BullMQ consumer – Playwright scanning
packages/
  rules/          # Rule definitions (versioned), pure functions
  collectors/     # Browser evidence collectors
  tracker-db/     # Tracker/cookie classification dataset + matcher
  shared/         # Zod schemas, types, constants
  report/         # HTML→PDF report rendering (RTL)
docs/
  SPEC.md, THREAT_MODEL.md, DATA_MAP.md, RULES.md
```

## 7. מנוע הסריקה (ליבה)

### 7.1 Collectors

| Collector | מה אוסף |
|-----------|---------|
| `network` | כל הבקשות: URL, סוג, initiator, timing, צד ראשון או שלישי |
| `cookies` | עוגיות (`context.cookies()`) + `Set-Cookie`: שם, דומיין, תפוגה, Secure, HttpOnly, SameSite |
| `storage` | מפתחות localStorage/sessionStorage (שמות בלבד, בלי ערכים) |
| `banner` | זיהוי CMP: חתימות של CMPs ידועים (OneTrust, Cookiebot, Complianz, CookieYes וכו') + היוריסטיקה של כפתורים ("אישור", "דחייה", "Accept", "Reject") |
| `forms` | טפסים: שדות, סוגים, labels, checkboxes מסומנים מראש, טקסט בסביבה, קישורים קרובים |
| `policy` | איתור מדיניות פרטיות (footer, `rel=privacy-policy`, מילות מפתח), חילוץ טקסט, שפה, תאריך עדכון |
| `security` | כותרות, TLS, HSTS, mixed content |
| `a11y` | axe-core (WCAG 2.1 AA tags) + איתור "הצהרת נגישות" |
| `screenshot` | צילום מסך ב-viewport לכל מצב |

### 7.2 שלושה מצבי דפדפן (ההבדל המרכזי)

1. **Baseline**: context נקי. טוענים את הדף וממתינים ל-network idle (+N שניות). **שום אינטראקציה.**
2. **Reject**: context חדש. לוחצים על "דחייה". אם אין כפתור כזה בשכבה הראשונה זה ממצא בפני עצמו. אחר כך מנווטים לדף נוסף.
3. **Accept**: context חדש. לוחצים על "אישור הכל".

**כללי השוואה:**

- tracker מסוג analytics או marketing ב-Baseline: חומרה גבוהה (`CK-PRECONSENT`).
- tracker ב-Reject: חומרה קריטית, כי ההסכמה לא מכובדת (`CK-REJECT-IGNORED`).
- אין כפתור דחייה בשכבה הראשונה (`CK-NO-REJECT`).
- קטגוריות לא-חיוניות מסומנות מראש (`CK-PRECHECKED`).
- אין קישור קבוע לניהול העדפות (`CK-NO-REVISIT`).

### 7.3 סיווג trackers

- מאגר פנימי `tracker-db` מבוסס על **Open Cookie Database** (Apache-2.0), עם הרחבה ידנית לספקים ישראליים.
- ⚠️ **DuckDuckGo Tracker Radar** מופץ ברישיון CC BY-NC-SA. **אסור לשימוש מסחרי.** לא משתמשים בו.
- ⚠️ גם EasyPrivacy (GPL/CC BY-SA) דורש בדיקת תאימות רישיון לפני שימוש.
- שיטות זיהוי: התאמת דומיין, שם עוגייה, ו-regex לנתיב (למשל `/tr?id=` של Meta Pixel ו-`/g/collect` של GA4).

### 7.4 Rule engine

כל כלל הוא פונקציה טהורה:

```ts
interface Rule {
  id: string;                 // e.g. "CK-PRECONSENT"
  version: string;            // semver; stored with every finding
  category: 'cookies' | 'policy' | 'forms' | 'security' | 'a11y' | 'vendors';
  jurisdictions: Array<'IL' | 'EU'>;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  evaluate(evidence: ScanEvidence): Finding[];
}
```

- **ציון:** רמת סיכון לפי קטגוריה (נמוך/בינוני/גבוה) **בלי אחוז "עמידה בחוק"**. כך נמנעת טענה מטעה ל-compliance.
- כל ממצא שומר את `ruleId@version` ומצביע על evidence, כדי שאפשר יהיה לשחזר אותו.

### 7.5 ניתוח מדיניות פרטיות (MVP: דטרמיניסטי)

רשימת רכיבים, כל אחד עם מילות מפתח בעברית ובאנגלית ועם ספי ביטחון:
זהות בעל המאגר ופרטי קשר · מטרות · סוגי מידע · צדדים שלישיים · העברה לחו"ל · תקופת שמירה · זכויות עיון ותיקון (ס' 13–14) · עוגיות · אבטחה · תאריך עדכון · DPO (אם רלוונטי) · בסיס חוקי (GDPR).

התוצאה היא "נמצא / לא נמצא / לא ודאי", **לא** "תקין". בדוח מופיע ציטוט של הקטע שנמצא.

## 8. סכמת בסיס נתונים (Prisma, תמצית)

```prisma
model Organization { id String @id @default(cuid()) name String createdAt DateTime @default(now())
  members Membership[] sites Site[] }
model User { id String @id @default(cuid()) email String @unique emailVerifiedAt DateTime?
  passwordHash String? mfaSecretEnc String? createdAt DateTime @default(now()) deletedAt DateTime?
  memberships Membership[] }
model Membership { userId String orgId String role Role  @@id([userId, orgId]) }
enum Role { OWNER ADMIN VIEWER }
model Site { id String @id @default(cuid()) orgId String hostname String
  verifiedAt DateTime? verifyToken String scheduleCron String?
  @@unique([orgId, hostname]) scans Scan[] }
model Scan { id String @id @default(cuid()) siteId String? hostname String
  status ScanStatus depth ScanDepth rulesetVersion String
  startedAt DateTime? finishedAt DateTime? expiresAt DateTime
  requesterIpHash String? pages ScanPage[] findings Finding[] }
model ScanPage { id String @id @default(cuid()) scanId String url String
  mode BrowserMode evidenceKey String }   // evidence JSON in object storage
model Finding { id String @id @default(cuid()) scanId String ruleId String ruleVersion String
  severity Severity category String pageUrl String? evidenceRef Json }
model TrackerObservation { id String @id @default(cuid()) scanId String vendor String?
  category String domain String cookieName String? mode BrowserMode firstParty Boolean }
model AuditLog { id String @id @default(cuid()) orgId String? actorId String? action String
  targetType String targetId String at DateTime @default(now()) ipHash String? }
model ConsentRecord { id String @id @default(cuid()) anonId String policyVersion String
  categories Json at DateTime @default(now()) }
```

## 9. API Endpoints

| Method | Path | גישה | תיאור |
|--------|------|------|-------|
| POST | `/api/scans` | ציבורי + CAPTCHA + rate limit | יצירת סריקה בסיסית |
| GET | `/api/scans/:id` | ציבורי לתקציר (מזהה לא ניחוש, 128bit), מלא רק לחבר בארגון | סטטוס ותוצאה |
| GET | `/api/scans/:id/events` | כנ"ל | SSE להתקדמות |
| GET | `/api/scans/:id/report.pdf` | חבר בארגון + אתר מאומת | דוח PDF |
| GET | `/api/scans/:id/inventory?format=csv\|json` | חבר בארגון | מלאי עוגיות וספקים |
| POST | `/api/sites` | ADMIN+ | הוספת אתר |
| POST | `/api/sites/:id/verify` | ADMIN+ | בדיקת אימות דומיין |
| POST | `/api/sites/:id/scans` | ADMIN+ + verified | סריקה עמוקה |
| PATCH | `/api/sites/:id/schedule` | ADMIN+ | תזמון |
| GET/POST/DELETE | `/api/orgs/:id/members` | OWNER | ניהול משתמשים |
| POST | `/api/account/export` | משתמש | ייצוא מידע אישי |
| DELETE | `/api/account` | משתמש (re-auth) | מחיקת חשבון |
| — | `/api/auth/*` | — | Auth.js |

**בכל endpoint מוגן:** בדיקה ש-`resource.orgId ∈ user.memberships` בשכבת השירות (הגנה מ-IDOR/BOLA).

## 10. החלטות טכנולוגיות

| תחום | בחירה | למה | חלופות | מגבלות |
|------|-------|-----|--------|--------|
| שפה | TypeScript | טיפוסים משותפים בין UI, API ו-worker | — | — |
| Web | Next.js 15 (App Router) | SSR ל-SEO, API באותו פרויקט | Remix, Astro+Fastify | נעילה חלקית ל-Vercel. נפרוס ב-Docker |
| דפדפן | Playwright + Chromium | API יציב, ניהול contexts, route interception | Puppeteer | כבד בזיכרון (~300MB לכל context) |
| תור | BullMQ + Redis | retries, concurrency, scheduling | pg-boss (בלי Redis) | שירות נוסף לתחזוקה |
| DB | PostgreSQL + Prisma | יחסים, migrations | Drizzle | Prisma כבד ב-cold start |
| Auth | Auth.js (NextAuth v5) | Magic link + OAuth, ספרייה בשלה | Lucia, Clerk (SaaS, מידע אצל צד ג') | MFA דורש מימוש TOTP נוסף |
| ולידציה | Zod | שיתוף בין client ל-server | Valibot | — |
| נגישות | axe-core | תקן דה-פקטו | Pa11y | מזהה כ-30–40% מהבעיות בלבד |
| PDF | Playwright `page.pdf()` מ-HTML RTL | תמיכה מלאה בעברית | react-pdf | — |
| אחסון | S3-compatible (פרטי) | זול, presigned URLs | — | — |
| אירוח | Docker, VPS/Cloud באזור EU או IL | שליטה על מיקום המידע | Vercel + Fly (worker) | — |

## 11. Threat Model (תמצית)

| נכס / איום | סיכון | בקרה |
|------------|-------|------|
| **SSRF** דרך URL שהמשתמש מזין (הסיכון מספר 1 במערכת סריקה) | קריטי | DNS resolve ← חסימת IP פרטי, loopback, link-local ו-metadata (169.254.169.254) ← הצמדת ה-IP שנפתר. **בנוסף** egress proxy ברמת רשת שחוסם טווחים פנימיים, גם לבקשות משנה של הדפדפן. רק פורטים 80/443. מגבלת redirects עם בדיקה מחדש בכל קפיצה |
| דף זדוני שמנצל את Chromium | גבוה | worker ב-container ללא הרשאות, seccomp, read-only FS, בלי סודות, context חדש לכל סריקה, timeout קשיח, עדכון Chromium שוטף |
| שימוש במערכת ככלי תקיפה / DoS על אתר צד ג' | בינוני | rate limit לפי IP ולפי דומיין יעד, מקסימום דפים, User-Agent מזהה + דף הסבר, כיבוד robots.txt בסריקה לא מאומתת |
| IDOR בין ארגונים | גבוה | בדיקת orgId בשכבת השירות + בדיקות אוטומטיות ייעודיות |
| חשיפת דוחות | בינוני | מזהי סריקה אקראיים, דוח מלא רק אחרי אימות דומיין, presigned URL קצר מועד |
| Brute force / account takeover | בינוני | rate limit, הודעות גנריות, MFA לבעלי ארגון |
| XSS מתוכן שנאסף (כותרות, טקסט מדיניות) | גבוה | כל תוכן מהאתר הנסרק הוא untrusted: escaping ב-React, CSP קשיח, אף פעם `dangerouslySetInnerHTML` |
| Prompt injection (כשיתווסף LLM) | בינוני | תוכן נסרק כ-data, פלט מובנה בלבד, LLM לא מקבל הרשאות |

## 12. פרטיות של המערכת עצמה (Data Map)

| סוג מידע | מטרה | בסיס (GDPR) | אחסון | שמירה | צד ג' |
|----------|------|-------------|-------|-------|-------|
| אימייל משתמש | חשבון, התחברות | חוזה | Postgres | עד מחיקת חשבון + 30 יום | ספק דיוור טרנזקציוני (DPA) |
| hash סיסמה (argon2id) | אימות | חוזה | Postgres | כנ"ל | — |
| IP של מבקש סריקה | rate limit, מניעת שימוש לרעה | אינטרס לגיטימי | Redis (גולמי, TTL 24h), DB (hash + salt מסתובב) | 24h / 90 יום | — |
| תוצאות סריקה (מידע ציבורי של אתרים) | השירות | חוזה / אינטרס לגיטימי | Postgres + S3 | אנונימית: 30 יום. משתמש: 12 חודשים (ניתן להגדרה) | — |
| צילומי מסך | ראיות | כנ"ל | S3 פרטי, מוצפן | כנ"ל | — |
| Audit log | אבטחה | חובה חוקית / אינטרס לגיטימי | Postgres | 24 חודשים | — |
| רישומי הסכמה לעוגיות | הוכחת הסכמה | חובה חוקית | Postgres | 24 חודשים | — |

- **ה-worker לא שולח טפסים ולא שומר ערכי localStorage או תוכן עוגיות.** נשמרים שמות ומטא-דאטה בלבד. צילומי מסך עלולים להכיל מידע אישי שמופיע באתר (למשל המלצות עם שמות). לכן הם מוצפנים ונמחקים לפי מדיניות השמירה.
- **אתר המוצר עצמו:** רק עוגיות חיוניות (session, CSRF, העדפת הסכמה). אנליטיקה רק אחרי הסכמה, ועדיפות לכלי self-hosted (Plausible/Umami) שלא דורש העברה לצד ג'.

## 13. נגישות של המוצר

WCAG 2.1 AA / ת"י 5568: RTL מלא, HTML סמנטי, ניווט מקלדת, focus נראה, `aria-live` להתקדמות הסריקה, צבעי חומרה **עם אייקון וטקסט** (לא רק צבע), טבלאות עם `<th scope>`, PDF עם תגיות ככל ש-Chromium מאפשר (דורש אימות), עמוד הצהרת נגישות, ו-axe ב-CI.

## 14. תוכנית עבודה בשלבים

| שלב | תכולה | תוצר לבדיקה |
|-----|-------|-------------|
| **0** | Monorepo, lint, CI, Docker Compose (Postgres, Redis, MinIO), README, .env.example | `pnpm dev` רץ |
| **1** | Worker: SSRF guard, Playwright, collectors network/cookies/banner, 3 מצבים, tracker-db, כללי `CK-*` | CLI: `pnpm scan https://example.co.il` → JSON |
| **2** | collectors forms/policy/security/a11y + שאר הכללים, יחידות בדיקה עם fixtures (אתרים מקומיים מבוימים) | כיסוי כללים ≥90% |
| **3** | Web: דף בית, סריקה אנונימית, SSE, תקציר | זרימת US1 |
| **4** | Auth, ארגונים, אימות דומיין, דוח מלא, PDF, Inventory | US2–US5, US7 |
| **5** | תזמון, diff בין סריקות, התראות אימייל | US6 |
| **6** | מסמכים משפטיים (טיוטות), באנר עוגיות למוצר עצמו, הצהרת נגישות, Checklist פרודקשן | Go-live review |
| **7 (אופציונלי)** | ניתוח מדיניות בעזרת LLM, מחולל מדיניות, White-label, סליקה | — |

## 15. סיכונים ונושאים לבדיקה מקצועית

1. **אחריות משפטית:** דוח שגוי ("אין בעיה") עלול להטעות לקוח. צריך תנאי שימוש עם הגבלת אחריות, ניסוח "ממצאים טכניים" ובדיקת עו"ד. ⚖️
2. **סריקת אתרי צד ג' ללא הסכמה:** סריקה פסיבית של דפים ציבוריים היא בדרך כלל לגיטימית. פרסום תוצאות על אתר של אחר עלול להיחשב לשון הרע. לכן תקציר לא מאומת מוצג רק למבקש ולא מתפרסם. ⚖️
3. **דיוק:** false positives ו-false negatives (CMP לא מוכר, טעינה עצלה, A/B, geo-targeting). צריך סריקה מ-IP ישראלי ומ-IP אירופי, ולסמן את הדוח כ"נקודת זמן".
4. **רישוי מאגרי trackers:** ראו 7.3.
5. **שינויי חקיקה והנחיות הרשות:** כללים עם גרסאות + תהליך עדכון רבעוני.
6. **ביצועים ועלות:** Chromium כבד. צריך מכסות, concurrency ותור עדיפויות.
7. **רישום מאגר / הודעה לרשות על מאגר המשתמשים של המוצר עצמו, ומינוי DPO:** דורש בדיקה משפטית. ⚖️

## 16. הצעד הבא

אחרי אישור האפיון: **שלב 0 + שלב 1**. אלה מייצרים מנוע סריקה שעובד מ-CLI ומאפשרים לבדוק את הדיוק על אתרים אמיתיים לפני שבונים ממשק.

---

### מקורות שנבדקו

- box.co.il, סורק מדיניות פרטיות (נבדק: 4 בדיקות בסיסיות, בלי ציון, סריקה חינמית ותיקון בתשלום)
- gov.il, מדריך תיקון 13 לאנשי מקצוע: **חסם גישה אוטומטית (403). יש לעבור עליו ידנית.**
- privacy13.co.il, trio-cyber.co.il/gdpr-israel: **חסמו גישה אוטומטית (403). יש לעבור עליהם ידנית.**
- מקורות משניים: [y-law](https://www.y-law.co.il/blog/privacy-gdpr/privacy-act-13/), [alaw](https://alaw.co.il/privacy/law/amendment-13/), [Chambers 2026 – Israel](https://practiceguides.chambers.com/practice-guides/data-protection-privacy-2026/israel), [dpoisrael](https://dpoisrael.com/en/amendment-13/), [ai-law – first fines](https://www.ai-law.co.il/en/post/israel-s-privacy-protection-authority-steps-up-enforcement-first-fines-under-amendment-13)
