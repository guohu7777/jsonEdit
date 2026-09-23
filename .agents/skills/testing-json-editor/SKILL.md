---
name: testing-json-editor
description: How to launch and end-to-end test the Electron visual JSON editor on this VM (display, dialogs, clipboard, upload fallback)
---

# Testing the Electron JSON editor

## Launch
- Repo: `/home/ubuntu/json-editor`. Node is NOT on PATH by default — prefix `PATH=$HOME/node/bin:$PATH`.
- Built output lives in `out/` (`npm run build` regenerates). Packaged binary: `release/linux-unpacked/json-editor`.
- Run on the GUI display:
  ```
  cd /home/ubuntu/json-editor
  ELECTRON_DISABLE_SANDBOX=1 DISPLAY=:0 PATH=$HOME/node/bin:$PATH npx electron . --no-sandbox --disable-gpu &
  ```
  (`npm run dev` also works and needs the same PATH.) dbus/dconf errors in stderr are harmless.
- Maximize before recording: `wmctrl -a "JSON" && wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz` — window is 1400x900, larger than the 1024x768 screen.

## UI quirks
- VM has no CJK fonts: all Chinese labels (toolbar buttons, type-select options, tab names) render as boxes. Judge by position, not glyph shape. Emoji buttons 💬/＋/✕ may also look like boxes but are clickable.
- Per-row layout (leaf): key-name input → blue type `<select>` (~x176-195) → value editor → 💬 → ✕. Containers add a caret and ＋ between 💬 and ✕.
- Type `<select>` option order: string, longtext, number, boolean, null, url, file, date, color, select, object, array. Clicking opens a popup where options are ~15px tall starting under the select; `file` is the 7th item. Alternatively focus the closed select and press arrow-Down — each Down fires change.
- The comment editor (💬) autofocuses; Enter commits, blur also commits. Committed comments render as amber `// text` under the row and appear in the Schema preview tab.

## Native dialogs (GTK)
- Upload (上传文件) and import buttons open a GTK file chooser; 导出 JSON opens a GTK save dialog.
- Drive the file chooser with Ctrl+L → type absolute path → **click the Open/Save button**. Pressing Enter once may only complete the location bar, not confirm the dialog.
- 导出 JSON saves via save dialog to the folder shown (default ~/Downloads/data.json).

## Verifying without GUI tools
- Clipboard: `xclip`/`xsel` may not be installed — `sudo apt-get install -y xclip` (passwordless sudo works). Then `xclip -selection clipboard -o`.
- Upload fallback: with no custom API configured in settings (default), uploads write to `~/.config/json-editor/uploads/<uuid>-<safe-name>` and the field gets a `file://` URL — verify with `ls -lt` on that dir.
- userData dir: `~/.config/json-editor/`.
