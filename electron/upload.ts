import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app } from 'electron';

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

export function uploadProviderLabel(): string {
  return isCosConfigured() ? '腾讯云 COS' : '本地应用数据目录';
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

export async function uploadFile(data: Buffer, name: string, mimeType: string): Promise<string> {
  return isCosConfigured() ? uploadToCos(data, name, mimeType) : uploadLocal(data, name);
}
