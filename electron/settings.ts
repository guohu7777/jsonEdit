import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

export interface ApiUploadConfig {
  url: string;
  token?: string;
  fileField?: string;
  urlField?: string;
}

export interface Settings {
  upload: {
    provider: 'auto' | 'api';
    api: ApiUploadConfig;
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

export function getSettings(): Settings {
  if (cache) return cache;
  let loaded: Partial<Settings> = {};
  try {
    loaded = JSON.parse(readFileSync(settingsPath(), 'utf8')) as Partial<Settings>;
  } catch {
    // missing or malformed file -> defaults
  }
  cache = {
    upload: {
      provider: loaded.upload?.provider === 'api' ? 'api' : 'auto',
      api: { ...DEFAULTS.upload.api, ...(loaded.upload?.api ?? {}) },
    },
  };
  return cache;
}

export function saveSettings(next: Settings): Settings {
  cache = next;
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2));
  return cache;
}
