import robotsParserModule from 'robots-parser';

interface Robot {
  isAllowed(url: string, ua?: string): boolean | undefined;
}

/**
 * robots-parser is CommonJS (`module.exports = fn`) but its typings declare an ESM default export.
 * Under NodeNext the default import is `module.exports`, i.e. the function itself.
 */
const robotsParser = robotsParserModule as unknown as (url: string, body: string) => Robot;

export const BOT_USER_AGENT_TOKEN = 'PrivacyScanBot';

export interface RobotsPolicy {
  status: number | null;
  isAllowed(url: string): boolean;
}

const MAX_ROBOTS_BYTES = 500_000;

/**
 * Builds a robots policy from a fetched robots.txt (RFC 9309 semantics via robots-parser):
 * 2xx → parse; 4xx → allow all; 5xx/unreachable → allow only the explicitly requested target.
 */
export function buildRobotsPolicy(
  robotsUrl: string,
  status: number | null,
  body: string,
): RobotsPolicy {
  if (status !== null && status >= 200 && status < 300) {
    const robots = robotsParser(robotsUrl, body.slice(0, MAX_ROBOTS_BYTES));
    return {
      status,
      isAllowed: (url) => robots.isAllowed(url, BOT_USER_AGENT_TOKEN) !== false,
    };
  }
  if (status !== null && status >= 400 && status < 500) return { status, isAllowed: () => true };
  // RFC 9309 §2.3.1.4: unreachable robots.txt → assume complete disallow.
  return { status, isAllowed: () => false };
}
