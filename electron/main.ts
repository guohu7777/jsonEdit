import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';

import {
  getSettings,
  mergeSettings,
  saveSettings,
  toPublicSettings,
  type SettingsInput,
} from './settings';
import {
  endpointConfirmed,
  inspectEndpoint,
  isApiConfigured,
  parseApiUrl,
  uploadFile,
  type EndpointCheck,
} from './upload';

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
  const configured = isApiConfigured();
  return {
    configured,
    label: configured ? '自定义 API' : '未配置',
    settings: toPublicSettings(getSettings()),
  };
}

/** Only the app's own renderer may invoke privileged IPC; anything else is dropped. */
function trustedRenderer(event: IpcMainInvokeEvent): boolean {
  const frameUrl = event.senderFrame?.url ?? '';
  if (process.env.ELECTRON_RENDERER_URL) {
    try {
      return new URL(frameUrl).origin === new URL(process.env.ELECTRON_RENDERER_URL).origin;
    } catch {
      return false;
    }
  }
  const expected = pathToFileURL(join(import.meta.dirname, '../renderer/index.html')).href;
  return frameUrl === expected;
}

/** Private-network and plaintext-HTTP endpoints are the risky ones, so a human must confirm them. */
async function confirmEndpoint(
  win: BrowserWindow | null,
  url: URL,
  risks: { isPrivate: boolean; isHttp: boolean; changed?: boolean },
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
    message: `${risks.changed ? '上传地址的解析结果已变化 —— ' : ''}上传 API ${url.origin} ${reasons.join('、')}`,
    detail: '文件与 Token 会被发送到该地址。确认这是你自己的服务？',
  };
  const { response } = win
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options);
  return response === 1;
}

ipcMain.handle('upload:config', (event) => {
  if (!trustedRenderer(event)) throw new Error('Untrusted sender');
  return uploadConfig();
});

// UI theme is persisted renderer-side (localStorage); the renderer reports the
// resolved scheme so OS chrome and prefers-color-scheme stay consistent.
ipcMain.handle('theme:set', (event, mode: unknown) => {
  if (!trustedRenderer(event)) throw new Error('Untrusted sender');
  if (mode === 'light' || mode === 'dark' || mode === 'system') {
    nativeTheme.themeSource = mode;
  }
});

ipcMain.handle('settings:set', async (event, input: SettingsInput) => {
  if (!trustedRenderer(event)) throw new Error('Untrusted sender');
  const next = mergeSettings(input);
  const { api } = next.upload;
  if (api.url) {
    const check = await inspectEndpoint(api.url);
    // Only risky endpoints need consent, and an unchanged confirmed profile doesn't re-prompt.
    // endpointConfirmed returns true for an unparseable previous URL (e.g. a fresh empty
    // config), which must NOT count as prior consent — require a real previous URL.
    const prev = getSettings().upload.api;
    const alreadyConfirmed = Boolean(prev.url) && endpointConfirmed(prev, check);
    if ((check.isPrivate || check.isHttp) && !alreadyConfirmed) {
      const win = BrowserWindow.fromWebContents(event.sender);
      const changed = Boolean(prev.privateAddrs?.length);
      if (!(await confirmEndpoint(win, check.endpoint, { ...check, changed }))) {
        throw new Error('已取消：上传地址未经确认，未保存');
      }
    }
    api.allowPrivate = check.isPrivate;
    api.allowHttp = check.isHttp;
    api.privateAddrs = check.privateAddrs;
  }
  saveSettings(next);
  return uploadConfig();
});

ipcMain.handle(
  'upload:file',
  async (event, payload: { name: string; mimeType: string; data: ArrayBuffer }) => {
    if (!trustedRenderer(event)) throw new Error('Untrusted sender');
    let check: EndpointCheck | undefined;
    if (isApiConfigured()) {
      // DNS can change after the endpoint was confirmed; a new private target must be
      // re-confirmed before files and the bearer token go out.
      check = await inspectEndpoint(getSettings().upload.api.url);
      if (!endpointConfirmed(getSettings().upload.api, check)) {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!(await confirmEndpoint(win, check.endpoint, { ...check, changed: true }))) {
          throw new Error('已取消：上传地址的解析结果变化，未经确认');
        }
        // The dialog was open for a while; a concurrent settings:set must not be
        // clobbered by the stale object captured above.
        const cur = getSettings();
        if (parseApiUrl(cur.upload.api.url).href !== check.endpoint.href) {
          throw new Error('上传配置已变更，请重试');
        }
        cur.upload.api.allowPrivate = check.isPrivate;
        cur.upload.api.allowHttp = check.isHttp;
        cur.upload.api.privateAddrs = check.privateAddrs;
        saveSettings(cur);
      }
    }
    const buffer = Buffer.from(payload.data);
    return uploadFile(buffer, payload.name, payload.mimeType, check);
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
