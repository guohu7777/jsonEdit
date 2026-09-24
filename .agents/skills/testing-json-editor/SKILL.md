---
name: testing-json-editor
description: How to launch and end-to-end test the Electron visual JSON/resource editor on this VM (display, dialogs, clipboard, upload providers, settings modal)
---

# Testing the Electron JSON editor

## Launch

- Repo: `/home/ubuntu/json-editor`. Node is NOT on PATH by default — prefix `PATH=$HOME/node/bin:$PATH` (also needed for helper scripts like mock servers).
- Built output lives in `out/` (`npx electron-vite build` regenerates). Packaged binary: `release/linux-unpacked/json-editor`.
- Run on the GUI display:
  ```
  cd /home/ubuntu/json-editor
  ELECTRON_DISABLE_SANDBOX=1 DISPLAY=:0 PATH=$HOME/node/bin:$PATH npx electron . --no-sandbox --disable-gpu &
  ```
  (`npm run dev` also works and needs the same PATH.) dbus/dconf errors in stderr are harmless.
- Maximize before recording: `wmctrl -a "JSON" && wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz` — window is 1400x900, larger than the 1024x768 screen.

## UI quirks

- VM has no CJK fonts: Chinese labels render as boxes; judge by position, not glyph shape. Emoji/icon buttons may look like boxes but are clickable.
- UI is Mantine 8 (Teal primary, defaults to dark; ☀/🌙 toggle at far top-right switches light/dark, persisted in localStorage key `mantine-color-scheme-value`). The default sample is a root `resource` array → left pane shows `ResourceList` table (ID | 名称 | 类型 | URL(with upload btn) | 缓存 | 🗑), NOT the generic tree. Other top-level keys render as tree rows below the table.
- Upload settings: ⚙️ gear button at far top-right of toolbar opens a Mantine Modal "上传设置". The provider Select is a Mantine dropdown — click the select, then click the option row in the floating dropdown. Selecting 自定义 API expands the modal with API 地址/Token/文件字段名/响应 URL 字段 fields; 自动（本地应用数据目录）shrinks it — **the 保存/取消 buttons move**, screenshot before clicking them (clicking where they used to be hits the modal overlay and closes it).
- The toolbar provider Badge shows "上传 → 自定义 API" or "上传 → 本地应用数据目录".

## Native dialogs (GTK + Electron)

- File pickers (upload/导入): GTK file chooser — Ctrl+L → type absolute path → **click the Open/Save button**; pressing Enter once may only complete the location bar. Alternatively click the file in the list then Open.
- 导出 JSON/Schema: GTK save dialog, default lands in ~/Downloads.
- SSRF confirmation ("确认上传地址"): a native `dialog.showMessageBox` (NOT GTK) appears when saving a private/HTTP API endpoint that doesn't match the previously confirmed origin — buttons are 取消 (left) / 仍然保存 (right). On first-ever save it may be skipped (see bug note below). 取消 leaves the modal open and shows an error banner; settings.json is not written.
- KNOWN BUG (PR #10): the first time a private/HTTP endpoint is saved (empty previous api.url), the confirmation dialog is skipped yet allowPrivate/allowHttp/privateAddrs are still written — because `endpointConfirmed` returns true when the stored URL is unparseable. Changing to a different risky origin DOES trigger it.

## Verifying without GUI tools

- Clipboard: `xclip`/`xsel` may not be installed — `sudo apt-get install -y xclip` (passwordless sudo works). Then `xclip -selection clipboard -o`.
- Local upload fallback: files land in `~/.config/json-editor/uploads/<uuid>-<safe-name>` and the field gets a `file://` URL — verify with `ls -lt` on that dir.
- userData dir: `~/.config/json-editor/` — `settings.json` lives there (upload.provider auto|api, api.url/fileField/urlField/token, allowPrivate/allowHttp/privateAddrs).
- Custom-API upload proof: run a mock server (`node` with PATH) that logs Content-Type/body and returns `{"data":{"url":"https://example.com/x.png"}}`; set 响应 URL 字段 to `data.url` to exercise nested-path extraction. App-side requests use a `----jsoneditor-<uuid>` multipart boundary — distinguishable from curl in the log.
