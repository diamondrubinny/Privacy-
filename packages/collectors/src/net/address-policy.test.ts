import { describe, expect, it } from 'vitest';
import {
  assertPublicUrl,
  DEFAULT_POLICY,
  isPublicAddress,
  parseTargetUrl,
  PolicyError,
  type Resolver,
} from './address-policy.js';

const fixedResolver =
  (map: Record<string, string[]>): Resolver =>
  (host) => {
    const hit = map[host];
    return hit ? Promise.resolve(hit) : Promise.reject(new Error('NXDOMAIN'));
  };

async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  await expect(p).rejects.toSatisfy((e) => e instanceof PolicyError && e.code === code);
}

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '255.255.255.255',
    '224.0.0.1',
    '198.18.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd00:ec2::254',
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    '64:ff9b::a9fe:a9fe',
    '2002:7f00:1::1',
    'not-an-ip',
  ])('refuses %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(['8.8.8.8', '151.101.1.69', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'allows %s',
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true);
    },
  );
});

describe('parseTargetUrl', () => {
  it('adds https when scheme is missing and drops the fragment', () => {
    expect(parseTargetUrl(' example.co.il/about#x ').href).toBe('https://example.co.il/about');
  });

  it('normalizes numeric host tricks via WHATWG URL', () => {
    expect(parseTargetUrl('http://0x7f.1/').hostname).toBe('127.0.0.1');
  });

  it.each([
    ['ftp://example.com', 'unsupported-scheme'],
    ['file:///etc/passwd', 'unsupported-scheme'],
    ['javascript://alert(1)', 'unsupported-scheme'],
    ['https://user:pass@example.com', 'credentials-in-url'],
    ['https://', 'invalid-url'],
    ['', 'invalid-url'],
  ])('rejects %s', (input, code) => {
    expect(() => parseTargetUrl(input)).toThrow(expect.objectContaining({ code }));
  });
});

describe('assertPublicUrl', () => {
  const resolver = fixedResolver({
    'public.example': ['93.184.216.34'],
    'internal.example': ['10.0.0.5'],
    'mixed.example': ['93.184.216.34', '127.0.0.1'],
    'metadata.example': ['169.254.169.254'],
  });

  it('accepts a public host', async () => {
    await expect(
      assertPublicUrl(new URL('https://public.example/'), DEFAULT_POLICY, resolver),
    ).resolves.toEqual(['93.184.216.34']);
  });

  it('rejects private, mixed and metadata answers', async () => {
    for (const host of ['internal.example', 'mixed.example', 'metadata.example']) {
      await expectCode(
        assertPublicUrl(new URL(`https://${host}/`), DEFAULT_POLICY, resolver),
        'non-public-address',
      );
    }
  });

  it('rejects IP literals in private ranges without DNS', async () => {
    await expectCode(
      assertPublicUrl(new URL('http://[::1]/'), DEFAULT_POLICY, resolver),
      'non-public-address',
    );
    await expectCode(
      assertPublicUrl(new URL('http://169.254.169.254/latest/meta-data'), DEFAULT_POLICY, resolver),
      'non-public-address',
    );
  });

  it('rejects non-standard ports', async () => {
    await expectCode(
      assertPublicUrl(new URL('http://public.example:6379/'), DEFAULT_POLICY, resolver),
      'port-not-allowed',
    );
  });

  it('reports DNS failures', async () => {
    await expectCode(
      assertPublicUrl(new URL('https://nx.example/'), DEFAULT_POLICY, resolver),
      'dns-failure',
    );
  });

  it('allows private targets only when explicitly enabled', async () => {
    await expect(
      assertPublicUrl(
        new URL('https://internal.example/'),
        { ...DEFAULT_POLICY, allowPrivateNetworks: true },
        resolver,
      ),
    ).resolves.toEqual(['10.0.0.5']);
  });
});
