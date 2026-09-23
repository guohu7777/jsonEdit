import { contextBridge, ipcRenderer } from 'electron';

import type { Settings } from './settings';

export interface UploadConfigInfo {
  provider: 'api' | 'cos' | 'local';
  label: string;
  settings: Settings;
}

export interface JsonEditorApi {
  getUploadConfig(): Promise<UploadConfigInfo>;
  setSettings(settings: Settings): Promise<UploadConfigInfo>;
  uploadFile(file: { name: string; mimeType: string; data: ArrayBuffer }): Promise<string>;
}

const api: JsonEditorApi = {
  getUploadConfig: () => ipcRenderer.invoke('upload:config'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  uploadFile: (file) => ipcRenderer.invoke('upload:file', file),
};

contextBridge.exposeInMainWorld('jsonEditor', api);
