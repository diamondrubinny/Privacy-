#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { PolicyError, SandboxUnavailableError } from '@privacyscan/collectors';
import type { BrowserMode, ScanResult } from '@privacyscan/shared';
import { ConfigError, loadConfig } from './config.js';
import { runScan } from './scan-job.js';

const USAGE = `Usage: privacyscan <url> [options]

Options:
  --modes <list>   Comma-separated browser modes (default: baseline,reject,accept)
  --out <file>     Write JSON result to a file instead of stdout
  --pretty         Pretty-print JSON
  --summary        Print a short human-readable summary to stderr
  --screenshots <dir>  Save per-mode screenshots (local troubleshooting; may contain personal data)
  --skip-audit     Consent analysis only (no crawl of forms/policy/security/a11y)
  --debug          Print stack traces on failure (local troubleshooting only)
  -h, --help       Show this help

Configuration is read from environment variables (see .env.example).`;

const ALL_MODES: readonly BrowserMode[] = ['baseline', 'reject', 'accept'];

function parseModes(value: string | undefined): BrowserMode[] {
  if (!value) return [...ALL_MODES];
  const modes = value.split(',').map((m) => m.trim());
  const invalid = modes.filter((m) => !ALL_MODES.includes(m as BrowserMode));
  if (invalid.length || modes.length === 0) {
    throw new Error(`Invalid --modes value. Allowed: ${ALL_MODES.join(', ')}`);
  }
  return [...new Set(modes)] as BrowserMode[];
}

function printSummary(result: ScanResult): void {
  const lines = [
    `Scan ${result.scanId} — ${result.targetUrl}`,
    `Findings: ${result.findings.length} (ruleset ${result.rulesetVersion})`,
    ...result.findings.map((f) => `  [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`),
    `Trackers: ${result.inventory.trackers.map((t) => `${t.vendor}${t.beforeConsent ? ' (pre-consent)' : ''}`).join(', ') || 'none'}`,
  ];
  for (const m of Object.values(result.evidence.modes)) {
    const status = m.error ? ` error=${m.error}` : '';
    const action = m.action
      ? ` action=${m.action.kind}:${m.action.clicked ? 'clicked' : (m.action.error ?? 'no')}`
      : '';
    lines.push(
      `  mode ${m.mode}: ${m.requests.length} requests, ${m.cookies.length} cookies, banner=${m.banner.found ? (m.banner.cmp ?? 'yes') : 'no'}${action}${status}`,
    );
  }
  if (result.ruleErrors.length)
    lines.push(`Rule errors: ${result.ruleErrors.map((e) => e.ruleId).join(', ')}`);
  console.error(lines.join('\n'));
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      modes: { type: 'string' },
      out: { type: 'string' },
      pretty: { type: 'boolean', default: false },
      summary: { type: 'boolean', default: false },
      debug: { type: 'boolean', default: false },
      screenshots: { type: 'string' },
      'skip-audit': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help || positionals.length !== 1 || !positionals[0]) {
    console.error(USAGE);
    return values.help ? 0 : 2;
  }

  const config = loadConfig();
  const cwd = process.env.INIT_CWD ?? process.cwd();
  let screenshotDir: string | undefined;
  if (values.screenshots) {
    screenshotDir = resolve(cwd, values.screenshots);
    await mkdir(screenshotDir, { recursive: true, mode: 0o700 });
  }
  const result = await runScan(
    {
      url: positionals[0],
      modes: parseModes(values.modes),
      skipAudit: values['skip-audit'],
      ...(screenshotDir ? { screenshotDir } : {}),
    },
    config,
  );
  const json = JSON.stringify(result, null, values.pretty ? 2 : undefined);
  if (values.out) {
    // `pnpm scan` runs inside apps/worker; resolve relative paths against the caller's cwd.
    const outPath = resolve(cwd, values.out);
    await writeFile(outPath, `${json}\n`, { encoding: 'utf8', mode: 0o600 });
  } else {
    process.stdout.write(`${json}\n`);
  }
  if (values.summary) printSummary(result);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    // User-facing errors only; never dump stack traces or configuration values.
    if (error instanceof PolicyError) console.error(`Refused: ${error.message} (${error.code})`);
    else if (error instanceof ConfigError || error instanceof SandboxUnavailableError)
      console.error(error.message);
    else if (error instanceof Error && error.message.startsWith('Invalid --modes'))
      console.error(error.message);
    else if (
      error instanceof TypeError &&
      'code' in error &&
      error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION'
    )
      console.error(error.message);
    else console.error(`Scan failed: ${error instanceof Error ? error.name : 'unknown error'}`);
    if (process.argv.includes('--debug')) console.error(error);
    process.exitCode = 1;
  },
);
