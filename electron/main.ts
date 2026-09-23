import { join } from 'node:path';
import { BrowserWindow, app, ipcMain, shell } from 'electron';

import { loadEnvFile } from './env';
import { getSettings, saveSettings, type Settings } from './settings';
import { activeProvider, uploadFile, uploadProviderLabel } from './upload';

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

ipcMain.handle('upload:config', () => ({
  provider: activeProvider(),
  label: uploadProviderLabel(),
  settings: getSettings(),
}));

ipcMain.handle('settings:set', (_event, settings: Settings) => {
  saveSettings(settings);
  return {
    provider: activeProvider(),
    label: uploadProviderLabel(),
    settings: getSettings(),
  };
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
