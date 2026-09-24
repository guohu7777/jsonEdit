/** What the main process exposes: the stored token stays there, only its presence is reported. */
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

/** `token`: undefined keeps the stored one, null clears it, a string replaces it. */
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

export interface UploadConfig {
  provider: 'api' | 'cos' | 'local';
  label: string;
  settings: PublicSettings;
}

export async function fetchUploadConfig(): Promise<UploadConfig> {
  return window.jsonEditor.getUploadConfig();
}

export async function saveSettings(settings: SettingsInput): Promise<UploadConfig> {
  return window.jsonEditor.setSettings(settings);
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
