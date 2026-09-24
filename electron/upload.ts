import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app } from 'electron';

import { getSettings, type ApiUploadConfig } from './settings';

export type UploadProvider = 'api' | 'local';

/** Only http(s) endpoints may be called from the main process. */
export function parseApiUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`上传 API 地址无效: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`上传 API 地址必须使用 http 或 https: ${url}`);
  }
  if (!parsed.hostname) throw new Error(`上传 API 地址缺少主机名: ${url}`);
  return parsed;
}

const PRIVATE_IPV4 =
  /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

/** Loopback / link-local / RFC1918 targets are the SSRF-interesting ones and need explicit consent. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (
    host === '::' ||
    host === '::1' ||
    host.startsWith('fe80:') ||
    host.startsWith('fc') ||
    host.startsWith('fd')
  ) {
    return true;
  }
  if (host.startsWith('::ffff:')) return PRIVATE_IPV4.test(host.slice(7));
  return PRIVATE_IPV4.test(host);
}

export interface EndpointCheck {
  endpoint: URL;
  isHttp: boolean;
  isPrivate: boolean;
  /** Every address the endpoint resolved to at check time; uploads connect only to these. */
  addrs: LookupAddress[];
  /** The private addresses among `addrs` (literal IP hosts included). */
  privateAddrs: string[];
}

/** Resolves the endpoint and reports its risk profile; DNS is consulted, not just the hostname. */
export async function inspectEndpoint(url: string): Promise<EndpointCheck> {
  const endpoint = parseApiUrl(url);
  const host = endpoint.hostname.replace(/^\[|\]$/g, '');
  let addrs: LookupAddress[] = [];
  try {
    addrs = await lookup(host, { all: true, verbatim: true });
  } catch {
    // unresolvable host; the upload itself will fail anyway
  }
  const privateAddrs = addrs.map((a) => a.address).filter(isPrivateHost);
  return {
    endpoint,
    isHttp: endpoint.protocol === 'http:',
    isPrivate: isPrivateHost(host) || privateAddrs.length > 0,
    addrs,
    privateAddrs,
  };
}

/** DNS rebinding defense: the upload connects only to the addresses just validated. */
function pinnedLookup(addrs: LookupAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    if ('all' in options && options.all) {
      callback(null, addrs);
    } else {
      callback(null, addrs[0].address, addrs[0].family);
    }
  };
}

/**
 * True when the endpoint's current risk profile still matches what the user confirmed:
 * http needs `allowHttp`, and a private-resolving endpoint needs `allowPrivate` plus a
 * current private address set contained in the confirmed `privateAddrs` (a DNS change to
 * different private targets requires fresh confirmation).
 */
export function endpointConfirmed(
  api: { url: string; allowPrivate?: boolean; allowHttp?: boolean; privateAddrs?: string[] },
  check: EndpointCheck,
): boolean {
  let origin: string | null = null;
  try {
    origin = new URL(api.url).origin;
  } catch {
    return true; // invalid stored URL; parseApiUrl will surface the error
  }
  if (check.endpoint.origin !== origin) return false;
  if (check.isHttp && !api.allowHttp) return false;
  if (
    check.isPrivate &&
    !(
      api.allowPrivate &&
      check.privateAddrs.every((a) => (api.privateAddrs ?? []).includes(a))
    )
  ) {
    return false;
  }
  return true;
}

/** Throws unless the endpoint's risks were confirmed by the user. */
export function assertEndpointAllowed(
  api: { url: string; allowPrivate?: boolean; allowHttp?: boolean; privateAddrs?: string[] },
  check: EndpointCheck,
): void {
  if (check.addrs.length === 0) {
    throw new Error(`上传地址无法解析: ${check.endpoint.hostname}`);
  }
  if (check.isHttp && !api.allowHttp) {
    throw new Error('HTTP 明文上传地址未经确认，请在「上传设置」中重新保存');
  }
  if (!endpointConfirmed(api, check)) {
    throw new Error('上传地址指向内网/本机且未经确认，请在「上传设置」中重新保存');
  }
}

export function isApiConfigured(): boolean {
  const s = getSettings();
  return s.upload.provider === 'api' && Boolean(s.upload.api.url);
}

export function activeProvider(): UploadProvider {
  return isApiConfigured() ? 'api' : 'local';
}

export function uploadProviderLabel(): string {
  return activeProvider() === 'api' ? '自定义 API' : '本地应用数据目录';
}

function safeFileName(originalName: string): string {
  return originalName.split(/[\\/]/).pop()?.replace(/[^\w.-]/g, '_') || 'file';
}

async function uploadLocal(data: Buffer, name: string): Promise<string> {
  const dir = join(app.getPath('userData'), 'uploads');
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, `${randomUUID()}-${safeFileName(name)}`);
  await writeFile(dest, data);
  return pathToFileURL(dest).href;
}

function resolveField(json: unknown, fieldPath: string): unknown {
  let cur: unknown = json;
  for (const seg of fieldPath.split('.').filter(Boolean)) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

const MAX_RESPONSE_BYTES = 1024 * 1024;

function readBody(res: IncomingMessage): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    res.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_RESPONSE_BYTES) {
        res.destroy(new Error('上传响应超过 1MB 上限'));
        return;
      }
      chunks.push(c);
    });
    res.on('end', () => resolvePromise(Buffer.concat(chunks)));
    res.on('error', reject);
  });
}

/** Multipart header values must not carry CRLF, quotes, or control chars into the request. */
function headerValue(value: string): string {
  return value.replace(/[\r\n"\\\x00-\x1f\x7f]/g, '_');
}

async function uploadToApi(
  data: Buffer,
  name: string,
  mimeType: string,
  api: ApiUploadConfig,
  check: EndpointCheck,
): Promise<string> {
  // The check and the config must be one snapshot: a same-origin URL edit landing
  // mid-flight must not send to the superseded path. Compare canonical forms so a
  // stored text like "https://host" matches its parsed "https://host/".
  if (check.endpoint.href !== parseApiUrl(api.url).href) {
    throw new Error('上传地址已变更，请重试');
  }
  assertEndpointAllowed(api, check);
  const { endpoint } = check;
  const boundary = `----jsoneditor-${randomUUID()}`;
  const fileField = headerValue(api.fileField || 'file');
  const fileName = headerValue(name) || 'file';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: ${headerValue(mimeType)}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  // Custom query params ride on the request URL only — they cannot change the
  // validated origin, so the endpoint check above stays authoritative.
  const requestUrl = new URL(endpoint.href);
  for (const [k, v] of Object.entries(api.query ?? {})) {
    requestUrl.searchParams.set(k, v);
  }
  const doRequest = endpoint.protocol === 'https:' ? httpsRequest : httpRequest;
  const res = await new Promise<IncomingMessage>((resolvePromise, reject) => {
    const req = doRequest(
      requestUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
          ...(api.token ? { Authorization: `Bearer ${api.token}` } : {}),
        },
        // Connect only to the addresses validated by `check`; a DNS change between
        // now and connect time cannot redirect this request to another service.
        ...(check.addrs.length > 0 ? { lookup: pinnedLookup(check.addrs) } : {}),
      },
      resolvePromise,
    );
    req.on('error', reject);
    req.end(body);
  });
  const status = res.statusCode ?? 0;
  const text = (await readBody(res)).toString('utf8');
  if (status >= 300 && status < 400) {
    throw new Error(`上传接口返回重定向 ${status}，出于安全考虑不跟随`);
  }
  if (status < 200 || status >= 300) {
    throw new Error(`上传接口返回 ${status}: ${text.slice(0, 200)}`);
  }
  const json: unknown = JSON.parse(text);
  const field = api.urlField || 'url';
  const url = resolveField(json, field);
  if (typeof url !== 'string' || !url) {
    throw new Error(`上传响应中未找到 URL 字段 '${field}'`);
  }
  return url;
}

export async function uploadFile(
  data: Buffer,
  name: string,
  mimeType: string,
  check?: EndpointCheck,
): Promise<string> {
  if (isApiConfigured()) {
    const api = getSettings().upload.api;
    const resolved = check ?? (await inspectEndpoint(api.url));
    return uploadToApi(data, name, mimeType, api, resolved);
  }
  return uploadLocal(data, name);
}
