# PrivacyScan IL

סורק אתרים לבדיקת פערי פרטיות מול **תיקון 13 לחוק הגנת הפרטיות**, **GDPR**, עוגיות והסכמה, אבטחה בסיסית ונגישות. הממשק והדוחות בעברית (RTL).

A website privacy-compliance scanner for Israeli Privacy Protection Law (Amendment 13) and GDPR: consent and cookie behavior, privacy-policy coverage, form notices, security headers and accessibility. Results are evidence-based and in Hebrew.

> **הבהרה משפטית:** הכלי מספק ממצאים טכניים בלבד. הוא **אינו ייעוץ משפטי** ואינו מאשר עמידה בחוק, ב-GDPR או בתקני נגישות.

## סטטוס

| שלב | תכולה | מצב |
|-----|-------|-----|
| 0 | Monorepo, lint, CI, Docker | ✅ |
| 1 | מנוע סריקה (CLI): SSRF guard, 3 מצבי דפדפן, זיהוי באנר, כללי `CK-*` | ✅ |
| 2+ | crawler, מדיניות פרטיות, טפסים, אבטחה, נגישות, Web UI | ⏳ |

מסמכים: [אפיון](docs/SPEC.md) · [תוכנית שלב 0-1](docs/PLAN-phase-0-1.md) · [קטלוג כללים](docs/RULES.md)

## איך זה עובד

כל סריקה פותחת Chromium בשלושה הקשרים נקיים:

1. **baseline**: טעינה בלי אינטראקציה. מה רץ לפני הסכמה?
2. **reject**: לחיצה על "דחייה" ורענון. האם הבחירה מכובדת?
3. **accept**: לחיצה על "אישור" ורענון. מלאי מלא של הכלים.

כל תעבורת הדפדפן עוברת דרך **egress proxy פנימי**. ה-proxy פותר DNS, חוסם כתובות פנימיות (כולל `169.254.169.254`) ומתחבר רק ל-IP שנבדק, וכך נחסם גם DNS rebinding.

**מזעור מידע:** לא נשמרים ערכי עוגיות, ערכי storage או ערכי query string. נשמרים שמות בלבד, וחריג יחיד הוא דגל Consent Mode `gcs`.

## דרישות

- Node.js 22 (`.nvmrc`), pnpm 10 (`corepack enable`)
- Chromium תואם ל-`playwright-core@1.64.1`

## התקנה

```bash
corepack enable
pnpm install
pnpm --filter @privacyscan/collectors exec playwright-core install chromium
cp .env.example .env   # optional; defaults are safe
```

אם Chromium מותקן במקום אחר: `SCANNER_CHROMIUM_EXECUTABLE_PATH=/path/to/chrome`.

## הרצה

```bash
pnpm scan https://example.co.il --summary --out scan-output/result.json
pnpm scan https://example.co.il --modes baseline --pretty
pnpm scan --help
```

| דגל | תיאור |
|-----|-------|
| `--modes` | `baseline,reject,accept` (ברירת מחדל: כולם) |
| `--out <file>` | כתיבת JSON לקובץ (הרשאות 600) |
| `--summary` | תקציר קריא ל-stderr |
| `--screenshots <dir>` | צילומי מסך לכל מצב (לאבחון מקומי בלבד; עלולים להכיל מידע אישי) |
| `--debug` | stack trace בשגיאה (מקומי בלבד) |

משתני סביבה: ראו [`.env.example`](.env.example). אפשרויות `SCANNER_UNSAFE_*` **נחסמות** כש-`NODE_ENV=production`.

## Docker

```bash
docker build -f apps/worker/Dockerfile -t privacyscan-worker .
docker run --rm --read-only --tmpfs /tmp:size=512m --cap-drop ALL \
  --security-opt no-new-privileges:true --shm-size 1g \
  privacyscan-worker https://example.co.il --summary
```

האימג' רץ כמשתמש לא-root (`pwuser`). גרסת האימג' `mcr.microsoft.com/playwright` חייבת להתאים לגרסת `playwright-core`.

## בדיקות

```bash
pnpm lint && pnpm typecheck && pnpm format:check
pnpm test        # unit (מהיר, ללא דפדפן)
pnpm test:e2e    # Chromium אמיתי מול אתרי בדיקה מבוימים (good/bad/ignore/notice)
```

בדיקות ה-E2E מאמתות גם שהדפדפן **לא** מצליח להגיע ל-`127.0.0.1` ול-`169.254.169.254` מתוך דף זדוני.

## מבנה

```
apps/worker            CLI (later: queue consumer)
packages/shared        types
packages/tracker-db    tracker dataset + matcher
packages/collectors    SSRF policy, egress proxy, browser modes, banner detection
packages/rules         rules engine, CK-* rules, inventory
test/                  e2e tests + staged fixture sites
```

## מגבלות ידועות

ראו [docs/RULES.md](docs/RULES.md#מגבלות-ידועות): מיקום גאוגרפי, שונות בין סריקות, וזיהוי באנר היוריסטי.

## רישיון

קנייני. כל הזכויות שמורות. ראו [`LICENSE`](LICENSE).
