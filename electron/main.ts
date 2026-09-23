import { join } from 'node:path';
import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron';

import { loadEnvFile } from './env';
import {
  getSettings,
  mergeSettings,
  saveSettings,
  toPublicSettings,
  type SettingsInput,
} from './settings';
import {
  activeProvider,
  isPrivateHost,
  parseApiUrl,
  uploadFile,
  uploadProviderLabel,
} from './upload';

loadEnvFile();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandboxed preloads must be CJS; this build emits ESM, so keep sandbox off.
      sandbox: false,
      // Renderer may hold file:// URLs written by the local upload fallback.
      webSecurity: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
}

function uploadConfig() {
  return {
    provider: activeProvider(),
    label: uploadProviderLabel(),
    settings: toPublicSettings(getSettings()),
  };
}

/** Private-network endpoints are the SSRF-interesting ones, so a human must confirm them. */
async function confirmPrivateEndpoint(win: BrowserWindow | null, url: URL): Promise<boolean> {
  const options = {
    type: 'warning' as const,
    buttons: ['取消', '仍然保存'],
    defaultId: 0,
    cancelId: 0,
    title: '确认上传地址',
    message: `上传 API 指向内网/本机地址：${url.origin}`,
    detail: '文件与 Token 会被发送到该地址。确认这是你自己的服务？',
  };
  const { response } = win
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options);
  return response === 1;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

ipcMain.handle('upload:config', () => uploadConfig());

ipcMain.handle('settings:set', async (event, input: SettingsInput) => {
  const next = mergeSettings(input);
  const { api } = next.upload;
  if (api.url) {
    const endpoint = parseApiUrl(api.url);
    const known = originOf(getSettings().upload.api.url);
    if (isPrivateHost(endpoint.hostname) && endpoint.origin !== known) {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!(await confirmPrivateEndpoint(win, endpoint))) {
        throw new Error('已取消：上传地址指向内网/本机，未保存');
      }
    }
  }
  saveSettings(next);
  return uploadConfig();
});

ipcMain.handle(
  'upload:file',
  async (_event, payload: { name: string; mimeType: string; data: ArrayBuffer }) => {
    const buffer = Buffer.from(payload.data);
    return uploadFile(buffer, payload.name, payload.mimeType);
  },
);

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
