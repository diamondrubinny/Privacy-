import http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import {
  assertPortAllowed,
  bareHostname,
  PolicyError,
  resolveAllowedAddresses,
  systemResolver,
  type AddressPolicy,
  type Resolver,
} from './address-policy.js';

export interface HostOverride {
  host: string;
  port: number;
}

export interface EgressProxyOptions {
  policy: AddressPolicy;
  resolver?: Resolver;
  /**
   * Test-only: route a requested hostname to a fixed local address, bypassing DNS and policy
   * for that hostname only. Never exposed via CLI/env, and refused when NODE_ENV=production.
   */
  hostOverrides?: ReadonlyMap<string, HostOverride>;
  /** Optional upstream HTTP proxy (http://[user:pass@]host:port). */
  upstreamProxy?: URL;
  onBlocked?: (event: { host: string; reason: string }) => void;
  connectTimeoutMs?: number;
  idleTimeoutMs?: number;
}

interface Destination {
  host: string;
  port: number;
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authorization',
  'proxy-authenticate',
  'proxy-connection',
  'te',
  'trailer',
  'upgrade',
]);

function stripHopByHop(headers: http.IncomingHttpHeaders): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined && !HOP_BY_HOP.has(key.toLowerCase())) out[key] = value;
  }
  return out;
}

function parseAuthority(authority: string): { hostname: string; port: number } | null {
  const match = /^(\[[0-9a-f:.]+\]|[^:[\]]+):(\d{1,5})$/i.exec(authority);
  if (!match?.[1] || !match[2]) return null;
  const port = Number(match[2]);
  if (port < 1 || port > 65535) return null;
  return { hostname: match[1].toLowerCase(), port };
}

function basicAuth(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

/**
 * Local forward proxy that every browser request must traverse.
 * It resolves each destination itself, enforces the address policy, then connects to the
 * vetted IP — so a DNS answer cannot change between the check and the connection
 * (DNS rebinding). With an upstream proxy, the upstream performs the final resolution;
 * that mode is meant for restricted development networks.
 *
 * No proxy authentication: the policy is enforced on every request regardless of the client,
 * the listener is bound to 127.0.0.1 inside a single-purpose container, and pages cannot reach
 * it directly (loopback destinations are refused). Skipping auth also avoids a 407 round-trip
 * (and Playwright request interception) on every new connection.
 */
export class EgressProxy {
  private readonly server: http.Server;
  private readonly resolver: Resolver;
  private readonly dnsCache = new Map<string, Promise<string[]>>();
  private readonly sockets = new Set<Duplex>();

  constructor(private readonly options: EgressProxyOptions) {
    if (options.hostOverrides && process.env.NODE_ENV === 'production') {
      throw new Error('hostOverrides are for test environments only');
    }
    this.resolver = options.resolver ?? systemResolver;
    this.server = http.createServer((req, res) => {
      void this.handleHttp(req, res);
    });
    this.server.on('connect', (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
      void this.handleConnect(req, socket, head);
    });
    this.server.on('connection', (socket: net.Socket) => {
      this.track(socket);
    });
    this.server.on('clientError', (_err, socket) => {
      socket.destroy();
    });
  }

  async start(): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        this.server.off('error', reject);
        resolve();
      });
    });
    const address = this.server.address();
    if (address === null || typeof address === 'string') throw new Error('Proxy failed to bind');
    return address.port;
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) =>
      this.server.close(() => {
        resolve();
      }),
    );
  }

  private track(socket: Duplex): void {
    this.sockets.add(socket);
    socket.once('close', () => this.sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    if (socket instanceof net.Socket) {
      socket.setTimeout(this.options.idleTimeoutMs ?? 60_000, () => socket.destroy());
    }
  }

  private blocked(host: string, reason: string): void {
    this.options.onBlocked?.({ host, reason });
  }

  private async resolveDestination(hostname: string, port: number): Promise<Destination> {
    const host = bareHostname(hostname).toLowerCase();
    const override = this.options.hostOverrides?.get(host);
    if (override) return override;
    assertPortAllowed(port, this.options.policy);
    let pending = this.dnsCache.get(host);
    if (!pending) {
      pending = resolveAllowedAddresses(host, this.options.policy, this.resolver);
      this.dnsCache.set(host, pending);
      // Do not cache failures; a transient DNS error should not poison the whole scan.
      pending.catch(() => this.dnsCache.delete(host));
    }
    const addresses = await pending;
    const first = addresses[0];
    if (!first) throw new PolicyError('dns-failure', `No address for ${host}`);
    return { host: first, port };
  }

  private async handleHttp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let target: URL;
    try {
      target = new URL(req.url ?? '');
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (target.protocol !== 'http:') {
      res.writeHead(400).end();
      return;
    }
    const port = target.port ? Number(target.port) : 80;
    const upstream = this.options.upstreamProxy;
    let dest: Destination;
    try {
      dest = await this.resolveDestination(target.hostname, port);
    } catch (error) {
      const reason = error instanceof PolicyError ? error.code : 'resolve-error';
      this.blocked(target.hostname, reason);
      res.writeHead(403, { 'X-PrivacyScan-Blocked': reason }).end();
      return;
    }

    const headers = stripHopByHop(req.headers);
    const overridden = this.options.hostOverrides?.has(bareHostname(target.hostname).toLowerCase());
    const requestOptions: http.RequestOptions =
      upstream && !overridden
        ? {
            host: upstream.hostname,
            port: Number(upstream.port || 80),
            path: target.href,
            headers: upstream.username
              ? {
                  ...headers,
                  'proxy-authorization': basicAuth(
                    decodeURIComponent(upstream.username),
                    decodeURIComponent(upstream.password),
                  ),
                }
              : headers,
          }
        : {
            host: dest.host,
            port: dest.port,
            path: `${target.pathname}${target.search}`,
            headers,
            setHost: false,
          };

    const outgoing = http.request(
      { ...requestOptions, method: req.method ?? 'GET' },
      (incoming) => {
        res.writeHead(incoming.statusCode ?? 502, stripHopByHop(incoming.headers));
        incoming.pipe(res);
      },
    );
    outgoing.setTimeout(this.options.connectTimeoutMs ?? 15_000, () => outgoing.destroy());
    outgoing.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(outgoing);
  }

  private async handleConnect(
    req: http.IncomingMessage,
    client: Duplex,
    head: Buffer,
  ): Promise<void> {
    this.track(client);
    const authority = parseAuthority(req.url ?? '');
    if (!authority) {
      client.end('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    let dest: Destination;
    try {
      dest = await this.resolveDestination(authority.hostname, authority.port);
    } catch (error) {
      const reason = error instanceof PolicyError ? error.code : 'resolve-error';
      this.blocked(authority.hostname, reason);
      client.end(
        `HTTP/1.1 403 Forbidden\r\nX-PrivacyScan-Blocked: ${reason}\r\nContent-Length: 0\r\n\r\n`,
      );
      return;
    }

    const overridden = this.options.hostOverrides?.has(bareHostname(authority.hostname));
    const upstream = overridden ? undefined : this.options.upstreamProxy;
    let server: net.Socket;
    try {
      server = upstream
        ? await this.connectViaUpstream(upstream, `${authority.hostname}:${authority.port}`)
        : await this.connectDirect(dest);
    } catch {
      client.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    this.track(server);
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length > 0) server.write(head);
    server.pipe(client);
    client.pipe(server);
    const closeBoth = (): void => {
      server.destroy();
      client.destroy();
    };
    server.once('close', closeBoth);
    client.once('close', closeBoth);
  }

  private connectDirect(dest: Destination): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: dest.host, port: dest.port });
      socket.setTimeout(this.options.connectTimeoutMs ?? 15_000, () => {
        socket.destroy(new Error('connect timeout'));
      });
      socket.once('connect', () => {
        socket.setTimeout(this.options.idleTimeoutMs ?? 60_000);
        resolve(socket);
      });
      socket.once('error', reject);
    });
  }

  private connectViaUpstream(upstream: URL, authority: string): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: upstream.hostname, port: Number(upstream.port || 80) });
      socket.setTimeout(this.options.connectTimeoutMs ?? 15_000, () => {
        socket.destroy(new Error('upstream timeout'));
      });
      socket.once('error', reject);
      socket.once('connect', () => {
        const auth = upstream.username
          ? `Proxy-Authorization: ${basicAuth(decodeURIComponent(upstream.username), decodeURIComponent(upstream.password))}\r\n`
          : '';
        socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n${auth}\r\n`);
      });
      let buffered = Buffer.alloc(0);
      const onData = (chunk: Buffer): void => {
        buffered = Buffer.concat([buffered, chunk]);
        const end = buffered.indexOf('\r\n\r\n');
        if (end === -1) {
          if (buffered.length > 16_384) socket.destroy(new Error('upstream header too large'));
          return;
        }
        socket.off('data', onData);
        const statusLine = buffered.subarray(0, buffered.indexOf('\r\n')).toString('latin1');
        if (!/^HTTP\/1\.[01] 200 /.test(statusLine)) {
          socket.destroy();
          reject(new Error('upstream refused CONNECT'));
          return;
        }
        const rest = buffered.subarray(end + 4);
        if (rest.length > 0) socket.unshift(rest);
        socket.setTimeout(this.options.idleTimeoutMs ?? 60_000);
        resolve(socket);
      };
      socket.on('data', onData);
    });
  }
}
