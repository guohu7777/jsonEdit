/** What the main process exposes: the stored token stays there, only its presence is reported. */
export interface PublicSettings {
  upload: {
    api: {
      url: string;
      fileField: string;
      urlField: string;
      hasToken: boolean;
      query: Record<string, string>;
    };
  };
}

/** `token`: undefined keeps the stored one, null clears it, a string replaces it. */
export interface SettingsInput {
  upload: {
    api: {
      url: string;
      fileField?: string;
      urlField?: string;
      query?: Record<string, string>;
      token?: string | null;
    };
  };
}

export interface UploadConfig {
  configured: boolean;
  label: string;
  settings: PublicSettings;
}

let cachedConfig: UploadConfig | null = null;

export async function fetchUploadConfig(): Promise<UploadConfig> {
  cachedConfig = await window.jsonEditor.getUploadConfig();
  return cachedConfig;
}

export async function saveSettings(settings: SettingsInput): Promise<UploadConfig> {
  cachedConfig = await window.jsonEditor.setSettings(settings);
  return cachedConfig;
}

/** Latest config snapshot from fetchUploadConfig/saveSettings; false before either resolves. */
export function uploadConfigured(): boolean {
  return cachedConfig?.configured ?? false;
}

export async function uploadFile(file: File): Promise<string> {
  const data = await file.arrayBuffer();
  return window.jsonEditor.uploadFile({
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    data,
  });
}

/** Tells the main process the resolved UI theme so OS chrome can follow. */
export async function setTheme(mode: 'light' | 'dark' | 'system'): Promise<void> {
  return window.jsonEditor.setTheme(mode);
}
