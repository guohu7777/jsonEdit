import { contextBridge, ipcRenderer } from 'electron';

export interface JsonEditorApi {
  getUploadConfig(): Promise<{ provider: 'cos' | 'local'; label: string }>;
  uploadFile(file: { name: string; mimeType: string; data: ArrayBuffer }): Promise<string>;
}

const api: JsonEditorApi = {
  getUploadConfig: () => ipcRenderer.invoke('upload:config'),
  uploadFile: (file) => ipcRenderer.invoke('upload:file', file),
};

contextBridge.exposeInMainWorld('jsonEditor', api);
