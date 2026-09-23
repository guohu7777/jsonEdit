import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

export interface ApiUploadConfig {
  url: string;
  token?: string;
  fileField?: string;
  urlField?: string;
  /** Set by the main process only, after the user confirmed the risk in a native dialog. */
  allowPrivate?: boolean;
  allowHttp?: boolean;
}

export interface Settings {
  upload: {
    provider: 'auto' | 'api';
    api: ApiUploadConfig;
  };
}

/** Settings shape exposed to the renderer: the bearer token never leaves the main process. */
export interface PublicSettings {
  upload: {
    provider: 'auto' | 'api';
    api: {
      url: string;
      fileField: string;
      urlField: string;
      hasToken: boolean;
    };
  };
}

/** Settings shape accepted from the renderer. `token`: undefined keeps, null clears, string sets. */
export interface SettingsInput {
  upload: {
    provider: 'auto' | 'api';
    api: {
      url: string;
      fileField?: string;
      urlField?: string;
      token?: string | null;
    };
  };
}

const DEFAULTS: Settings = {
  upload: {
    provider: 'auto',
    api: { url: '', token: '', fileField: 'file', urlField: 'url' },
  },
};

let cache: Settings | null = null;

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function normalize(raw: unknown): Settings {
  const upload = asRecord(asRecord(raw).upload);
  const api = asRecord(upload.api);
  return {
    upload: {
      provider: upload.provider === 'api' ? 'api' : 'auto',
      api: {
        url: asString(api.url, DEFAULTS.upload.api.url),
        token: asString(api.token, ''),
        fileField: asString(api.fileField, 'file') || 'file',
        urlField: asString(api.urlField, 'url') || 'url',
        allowPrivate: api.allowPrivate === true,
        allowHttp: api.allowHttp === true,
      },
    },
  };
}

export function getSettings(): Settings {
  if (cache) return cache;
  let loaded: unknown = null;
  try {
    loaded = JSON.parse(readFileSync(settingsPath(), 'utf8'));
  } catch {
    // missing or malformed file -> defaults
  }
  cache = normalize(loaded);
  return cache;
}

export function toPublicSettings(settings: Settings): PublicSettings {
  const { provider, api } = settings.upload;
  return {
    upload: {
      provider,
      api: {
        url: api.url,
        fileField: api.fileField || 'file',
        urlField: api.urlField || 'url',
        hasToken: Boolean(api.token),
      },
    },
  };
}

/** Merges renderer input with the stored token, which the renderer never sees. */
export function mergeSettings(input: SettingsInput): Settings {
  const upload = asRecord(asRecord(input).upload);
  const api = asRecord(upload.api);
  const token = api.token === undefined ? (getSettings().upload.api.token ?? '') : api.token;
  const merged = normalize({ upload: { provider: upload.provider, api: { ...api, token } } });
  // Risk flags are derived from the user's native-dialog confirmation, never from renderer input.
  merged.upload.api.allowPrivate = false;
  merged.upload.api.allowHttp = false;
  return merged;
}

export function saveSettings(next: Settings): Settings {
  mkdirSync(app.getPath('userData'), { recursive: true });
  // Write to a temp file then atomically rename, so a failed write can't truncate settings.json.
  const target = settingsPath();
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2));
  renameSync(tmp, target);
  cache = next;
  return cache;
}
