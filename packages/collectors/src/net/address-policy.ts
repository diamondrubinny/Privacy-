import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export type PolicyErrorCode =
  | 'invalid-url'
  | 'unsupported-scheme'
  | 'credentials-in-url'
  | 'port-not-allowed'
  | 'dns-failure'
  | 'non-public-address';

/** A target was refused by the network policy. Messages are safe to show to users. */
export class PolicyError extends Error {
  constructor(
    readonly code: PolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PolicyError';
  }
}

export interface AddressPolicy {
  allowedPorts: readonly number[];
  /** DANGER: permits loopback/private/link-local targets. Tests only. */
  allowPrivateNetworks: boolean;
}

export const DEFAULT_POLICY: AddressPolicy = {
  allowedPorts: [80, 443],
  allowPrivateNetworks: false,
};

export type Resolver = (hostname: string) => Promise<string[]>;

export const systemResolver: Resolver = async (hostname) => {
  const results = await lookup(hostname, { all: true, order: 'verbatim' });
  return results.map((r) => r.address);
};

/**
 * True only for globally routable unicast addresses. Everything else is refused:
 * private, loopback, link-local (incl. cloud metadata 169.254.169.254), CGNAT, multicast,
 * reserved, and IPv6 transition ranges that can embed an IPv4 address (6to4, Teredo, NAT64).
 */
export function isPublicAddress(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  let addr = ipaddr.parse(ip);
  if (addr.kind() === 'ipv6') {
    const v6 = addr as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) addr = v6.toIPv4Address();
  }
  return addr.range() === 'unicast';
}

const MAX_URL_LENGTH = 2048;

/** Parses user input into a scan target URL. Adds https:// when no scheme is given. */
export function parseTargetUrl(input: string): URL {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) {
    throw new PolicyError('invalid-url', 'כתובת האתר ריקה או ארוכה מדי');
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new PolicyError('invalid-url', 'כתובת האתר אינה תקינה');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PolicyError('unsupported-scheme', 'נתמכות רק כתובות http ו-https');
  }
  if (url.username || url.password) {
    throw new PolicyError('credentials-in-url', 'אין לכלול שם משתמש או סיסמה בכתובת');
  }
  url.hash = '';
  return url;
}

export function effectivePort(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

export function assertPortAllowed(port: number, policy: AddressPolicy): void {
  if (!policy.allowedPorts.includes(port)) {
    throw new PolicyError('port-not-allowed', `פורט ${port} אינו מותר לסריקה`);
  }
}

/** Strips IPv6 brackets as returned by URL#hostname ("[::1]" → "::1"). */
export function bareHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

/**
 * Resolves a hostname and returns its addresses only if ALL of them are allowed.
 * Refusing on any non-public answer prevents mixed-record tricks.
 */
export async function resolveAllowedAddresses(
  hostname: string,
  policy: AddressPolicy,
  resolver: Resolver = systemResolver,
): Promise<string[]> {
  const host = bareHostname(hostname);
  let addresses: string[];
  if (ipaddr.isValid(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await resolver(host);
    } catch {
      throw new PolicyError('dns-failure', `לא ניתן לאתר את הכתובת ${host}`);
    }
    if (addresses.length === 0) {
      throw new PolicyError('dns-failure', `לא ניתן לאתר את הכתובת ${host}`);
    }
  }
  if (!policy.allowPrivateNetworks && !addresses.every(isPublicAddress)) {
    throw new PolicyError('non-public-address', 'הכתובת מפנה לרשת פנימית ואינה ניתנת לסריקה');
  }
  return addresses;
}

/** Full pre-flight check for a user-supplied scan target. */
export async function assertPublicUrl(
  url: URL,
  policy: AddressPolicy = DEFAULT_POLICY,
  resolver: Resolver = systemResolver,
): Promise<string[]> {
  assertPortAllowed(effectivePort(url), policy);
  return resolveAllowedAddresses(url.hostname, policy, resolver);
}
