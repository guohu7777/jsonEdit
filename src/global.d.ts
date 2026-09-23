import type { SettingsInput, UploadConfig } from './api';

export {};

declare global {
  interface Window {
    jsonEditor: {
      getUploadConfig(): Promise<UploadConfig>;
      setSettings(settings: SettingsInput): Promise<UploadConfig>;
      uploadFile(file: {
        name: string;
        mimeType: string;
        data: ArrayBuffer;
      }): Promise<string>;
    };
  }
}
