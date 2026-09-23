import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';

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
  resolvesToPrivate,
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

/** Only the app's own renderer may invoke privileged IPC; anything else is dropped. */
function trustedRenderer(event: IpcMainInvokeEvent): boolean {
  const frameUrl = event.senderFrame?.url ?? '';
  if (process.env.ELECTRON_RENDERER_URL) {
    return frameUrl.startsWith(process.env.ELECTRON_RENDERER_URL);
  }
  const expected = pathToFileURL(join(import.meta.dirname, '../renderer/index.html')).href;
  return frameUrl === expected;
}

/** Private-network and plaintext-HTTP endpoints are the risky ones, so a human must confirm them. */
async function confirmEndpoint(
  win: BrowserWindow | null,
  url: URL,
  risks: { isPrivate: boolean; isHttp: boolean },
): Promise<boolean> {
  const reasons = [
    ...(risks.isPrivate ? ['指向内网/本机地址'] : []),
    ...(risks.isHttp ? ['使用明文 HTTP（传输不加密）'] : []),
  ];
  const options = {
    type: 'warning' as const,
    buttons: ['取消', '仍然保存'],
    defaultId: 0,
    cancelId: 0,
    title: '确认上传地址',
    message: `上传 API ${url.origin} ${reasons.join('、')}`,
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

ipcMain.handle('upload:config', (event) => {
  if (!trustedRenderer(event)) throw new Error('Untrusted sender');
  return uploadConfig();
});

ipcMain.handle('settings:set', async (event, input: SettingsInput) => {
  if (!trustedRenderer(event)) throw new Error('Untrusted sender');
  const next = mergeSettings(input);
  const { provider, api } = next.upload;
  // The API URL only matters for the custom provider; in auto mode it is inert.
  if (provider === 'api' && api.url) {
    const endpoint = parseApiUrl(api.url);
    const isHttp = endpoint.protocol === 'http:';
    const isPrivate =
      isPrivateHost(endpoint.hostname) || (await resolvesToPrivate(endpoint.hostname));
    const prev = getSettings().upload.api;
    const sameOrigin = endpoint.origin === originOf(prev.url ?? '');
    const needsConfirm =
      (isPrivate && !(sameOrigin && prev.allowPrivate)) ||
      (isHttp && !(sameOrigin && prev.allowHttp));
    if (needsConfirm) {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!(await confirmEndpoint(win, endpoint, { isPrivate, isHttp }))) {
        throw new Error('已取消：上传地址未经确认，未保存');
      }
    }
    api.allowPrivate = isPrivate;
    api.allowHttp = isHttp;
  }
  saveSettings(next);
  return uploadConfig();
});

ipcMain.handle(
  'upload:file',
  async (event, payload: { name: string; mimeType: string; data: ArrayBuffer }) => {
    if (!trustedRenderer(event)) throw new Error('Untrusted sender');
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
