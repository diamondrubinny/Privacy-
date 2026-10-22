import http from 'node:http';
import net from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_POLICY } from './address-policy.js';
import { EgressProxy } from './egress-proxy.js';

let target: http.Server;
let targetPort = 0;

beforeAll(async () => {
  target = http.createServer((req, res) => {
    res.end(`host=${req.headers.host ?? ''} path=${req.url ?? ''}`);
  });
  await new Promise<void>((r) => target.listen(0, '127.0.0.1', r));
  targetPort = (target.address() as net.AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((r) =>
    target.close(() => {
      r();
    }),
  );
});

function rawConnect(port: number, authority: string, authHeader?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      const extra = authHeader ? `Proxy-Authorization: ${authHeader}\r\n` : '';
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n${extra}\r\n`);
    });
    socket.once('data', (d) => {
      resolve(d.toString('latin1').split('\r\n')[0] ?? '');
      socket.destroy();
    });
    socket.once('error', reject);
  });
}

function proxiedGet(
  proxyPort: number,
  url: string,
  authHeader?: string,
): Promise<{ status: number; body: string; blocked?: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: proxyPort,
        path: url,
        headers: {
          host: new URL(url).host,
          ...(authHeader ? { 'proxy-authorization': authHeader } : {}),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c: Buffer) => (body += c.toString()));
        res.on('end', () => {
          const blocked = res.headers['x-privacyscan-blocked'];
          resolve({
            status: res.statusCode ?? 0,
            body,
            ...(typeof blocked === 'string' ? { blocked } : {}),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('EgressProxy – production policy', () => {
  const blockedEvents: { host: string; reason: string }[] = [];
  const proxy = new EgressProxy({
    policy: DEFAULT_POLICY,
    resolver: (host) =>
      Promise.resolve(host === 'rebind.example' ? ['127.0.0.1'] : ['169.254.169.254']),
    onBlocked: (e) => blockedEvents.push(e),
  });
  let port = 0;

  beforeAll(async () => {
    port = await proxy.start();
  });
  afterAll(() => proxy.stop());

  it('accepts unauthenticated clients but still enforces the policy', async () => {
    expect(await rawConnect(port, 'rebind.example:443')).toMatch(/^HTTP\/1\.1 403/);
  });

  it('blocks CONNECT to loopback IP literals', async () => {
    expect(await rawConnect(port, `127.0.0.1:443`)).toMatch(/^HTTP\/1\.1 403/);
  });

  it('blocks hostnames that resolve to internal addresses', async () => {
    expect(await rawConnect(port, 'rebind.example:443')).toMatch(/^HTTP\/1\.1 403/);
    const res = await proxiedGet(port, 'http://metadata.example/latest/meta-data');
    expect(res.status).toBe(403);
    expect(res.blocked).toBe('non-public-address');
  });

  it('blocks non-standard ports before resolving', async () => {
    expect(await rawConnect(port, `example.com:${targetPort}`)).toMatch(/^HTTP\/1\.1 403/);
  });

  it('rejects malformed CONNECT authorities', async () => {
    expect(await rawConnect(port, 'no-port')).toMatch(/^HTTP\/1\.1 400/);
  });

  it('reports blocked events', () => {
    expect(blockedEvents.map((e) => e.reason)).toContain('non-public-address');
    expect(blockedEvents.map((e) => e.reason)).toContain('port-not-allowed');
  });
});

describe('EgressProxy – test overrides', () => {
  it('refuses overrides in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(
        () =>
          new EgressProxy({
            policy: DEFAULT_POLICY,
            hostOverrides: new Map([['site.test', { host: '127.0.0.1', port: 1 }]]),
          }),
      ).toThrow(/test environments only/);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('keeps enforcing the policy for non-overridden hosts', async () => {
    const proxy = new EgressProxy({
      policy: DEFAULT_POLICY,
      hostOverrides: new Map([['site.test', { host: '127.0.0.1', port: targetPort }]]),
    });
    const port = await proxy.start();
    try {
      expect(await rawConnect(port, '127.0.0.1:443')).toMatch(/^HTTP\/1\.1 403/);
    } finally {
      await proxy.stop();
    }
  });

  it('routes overridden hosts to the fixture server and preserves Host', async () => {
    const proxy = new EgressProxy({
      policy: DEFAULT_POLICY,
      hostOverrides: new Map([['site.test', { host: '127.0.0.1', port: targetPort }]]),
    });
    const port = await proxy.start();
    try {
      const res = await proxiedGet(port, 'http://site.test/page?q=1');
      expect(res.status).toBe(200);
      expect(res.body).toBe('host=site.test path=/page?q=1');
      expect(await rawConnect(port, 'site.test:443')).toMatch(/^HTTP\/1\.1 200/);
    } finally {
      await proxy.stop();
    }
  });
});
