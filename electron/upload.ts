import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app } from 'electron';

import { getSettings } from './settings';

type CosClient = {
  putObject: (
    params: {
      Bucket: string;
      Region: string;
      Key: string;
      Body: Buffer;
      ContentType?: string;
    },
    cb: (err: unknown, data: unknown) => void,
  ) => void;
};

let cosClient: CosClient | null = null;

function cosEnv() {
  return {
    SecretId: process.env.COS_SECRET_ID,
    SecretKey: process.env.COS_SECRET_KEY,
    Bucket: process.env.COS_BUCKET,
    Region: process.env.COS_REGION,
    Prefix: (process.env.COS_PREFIX ?? 'json-editor').replace(/\/+$/, ''),
  };
}

export function isCosConfigured(): boolean {
  const { SecretId, SecretKey, Bucket, Region } = cosEnv();
  return Boolean(SecretId && SecretKey && Bucket && Region);
}

export type UploadProvider = 'api' | 'cos' | 'local';

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

/** Public-looking hostnames can still resolve to private addresses; check DNS too. */
export async function resolvesToPrivate(hostname: string): Promise<boolean> {
  try {
    const addrs = await lookup(hostname, { all: true, verbatim: true });
    return addrs.some((a) => isPrivateHost(a.address));
  } catch {
    return false; // unresolvable host; the upload itself will fail anyway
  }
}

/** Throws unless the endpoint's risks were confirmed by the user when it was saved. */
export async function assertEndpointAllowed(api: {
  url: string;
  allowPrivate?: boolean;
  allowHttp?: boolean;
}): Promise<URL> {
  const endpoint = parseApiUrl(api.url);
  if (endpoint.protocol === 'http:' && !api.allowHttp) {
    throw new Error('HTTP 明文上传地址未经确认，请在「上传设置」中重新保存');
  }
  if (
    !api.allowPrivate &&
    (isPrivateHost(endpoint.hostname) || (await resolvesToPrivate(endpoint.hostname)))
  ) {
    throw new Error('上传地址指向内网/本机且未经确认，请在「上传设置」中重新保存');
  }
  return endpoint;
}

export function isApiConfigured(): boolean {
  const s = getSettings();
  return s.upload.provider === 'api' && Boolean(s.upload.api.url);
}

export function activeProvider(): UploadProvider {
  if (isApiConfigured()) return 'api';
  return isCosConfigured() ? 'cos' : 'local';
}

export function uploadProviderLabel(): string {
  switch (activeProvider()) {
    case 'api':
      return '自定义 API';
    case 'cos':
      return '腾讯云 COS';
    default:
      return '本地应用数据目录';
  }
}

async function getCosClient(): Promise<CosClient> {
  if (cosClient) return cosClient;
  const { SecretId, SecretKey } = cosEnv();
  const mod = await import('cos-nodejs-sdk-v5');
  const COS = mod.default as unknown as new (opts: {
    SecretId?: string;
    SecretKey?: string;
  }) => CosClient;
  cosClient = new COS({ SecretId, SecretKey });
  return cosClient;
}

function safeFileName(originalName: string): string {
  return originalName.split(/[\\/]/).pop()?.replace(/[^\w.-]/g, '_') || 'file';
}

async function uploadToCos(data: Buffer, name: string, mimeType: string): Promise<string> {
  const { Bucket, Region, Prefix } = cosEnv();
  if (!Bucket || !Region) throw new Error('COS_BUCKET 和 COS_REGION 未配置');
  const date = new Date().toISOString().slice(0, 10);
  const Key = `${Prefix}/${date}/${randomUUID()}-${safeFileName(name)}`;
  const cos = await getCosClient();
  await new Promise<void>((resolvePromise, reject) => {
    cos.putObject(
      { Bucket, Region, Key, Body: data, ContentType: mimeType },
      (err) => (err ? reject(err) : resolvePromise()),
    );
  });
  const base = process.env.COS_PUBLIC_BASE;
  return base
    ? `${base.replace(/\/+$/, '')}/${Key}`
    : `https://${Bucket}.cos.${Region}.myqcloud.com/${Key}`;
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

async function uploadToApi(data: Buffer, name: string, mimeType: string): Promise<string> {
  const api = getSettings().upload.api;
  const endpoint = await assertEndpointAllowed(api);
  const form = new FormData();
  form.append(api.fileField || 'file', new Blob([new Uint8Array(data)], { type: mimeType }), name);
  const res = await fetch(endpoint, {
    method: 'POST',
    body: form,
    headers: api.token ? { Authorization: `Bearer ${api.token}` } : undefined,
    // A redirect would send the file and bearer token to an unvetted host.
    redirect: 'manual',
  });
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`上传接口返回重定向 ${res.status}，出于安全考虑不跟随`);
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`上传接口返回 ${res.status}: ${body}`);
  }
  const json: unknown = await res.json();
  const field = api.urlField || 'url';
  const url = resolveField(json, field);
  if (typeof url !== 'string' || !url) {
    throw new Error(`上传响应中未找到 URL 字段 '${field}'`);
  }
  return url;
}

export async function uploadFile(data: Buffer, name: string, mimeType: string): Promise<string> {
  if (isApiConfigured()) return uploadToApi(data, name, mimeType);
  return isCosConfigured() ? uploadToCos(data, name, mimeType) : uploadLocal(data, name);
}
