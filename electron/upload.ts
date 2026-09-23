import { randomUUID } from 'node:crypto';
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
  const form = new FormData();
  form.append(api.fileField || 'file', new Blob([new Uint8Array(data)], { type: mimeType }), name);
  const res = await fetch(api.url, {
    method: 'POST',
    body: form,
    headers: api.token ? { Authorization: `Bearer ${api.token}` } : undefined,
  });
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
