import { contextBridge, ipcRenderer } from 'electron';

import type { PublicSettings, SettingsInput } from './settings';

export interface UploadConfigInfo {
  provider: 'api' | 'cos' | 'local';
  label: string;
  settings: PublicSettings;
}

export interface JsonEditorApi {
  getUploadConfig(): Promise<UploadConfigInfo>;
  setSettings(settings: SettingsInput): Promise<UploadConfigInfo>;
  uploadFile(file: { name: string; mimeType: string; data: ArrayBuffer }): Promise<string>;
  setTheme(mode: 'light' | 'dark' | 'system'): Promise<void>;
}

const api: JsonEditorApi = {
  getUploadConfig: () => ipcRenderer.invoke('upload:config'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  uploadFile: (file) => ipcRenderer.invoke('upload:file', file),
  setTheme: (mode) => ipcRenderer.invoke('theme:set', mode),
};

contextBridge.exposeInMainWorld('jsonEditor', api);
