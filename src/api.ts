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

export interface UploadConfig {
  provider: 'api' | 'cos' | 'local';
  label: string;
  settings: Settings;
}

export async function fetchUploadConfig(): Promise<UploadConfig> {
  return window.jsonEditor.getUploadConfig();
}

export async function saveSettings(settings: Settings): Promise<UploadConfig> {
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
