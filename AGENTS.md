# AGENTS.md

给 AI 编码代理的项目说明：结构、命令、约定与易踩的坑。

## 项目是什么

跨平台 Electron 桌面应用：可视化 JSON 编辑器。树形 UI 编辑 JSON；每个字段可选类型；逐字段注释存在独立的 `SchemaNode` 树（导出为 `*.schema.json`）；「文件」类型字段经主进程上传（腾讯云 COS 或本地 fallback）后把 URL 写回 JSON。

## 命令

```bash
npm install            # 首次安装（需要 Node ≥ 20）
npm run dev            # electron-vite dev：主进程 + renderer 热更新
npm run build          # 三端构建到 out/
npm run typecheck      # tsc -b --noEmit —— 改完代码必须跑通
npm run pack           # electron-builder --dir，验证打包
npm run dist           # 产出安装包（AppImage/dmg/nsis，跨平台包需在对应 OS 上构建）
```

没有单元测试与 lint 配置；`typecheck` 是唯一的静态检查，提交前必须过。验证方式：`electron-vite build` 后用 `electron .` 或 `npm run pack` 启动解包目录实测。

## 结构速查

| 位置 | 内容 |
| --- | --- |
| `electron/main.ts` | BrowserWindow、IPC handler（`upload:config`、`upload:file`）、`.env` 加载 |
| `electron/preload.ts` | contextBridge 暴露 `window.jsonEditor`，渲染进程唯一的主进程入口 |
| `electron/upload.ts` | 上传 provider 选择：COS 配置齐 → COS，否则本地 `userData/uploads`（返回 `file://` URL） |
| `electron/env.ts` | 极简 .env 解析（不引 dotenv） |
| `src/App.tsx` | 全部状态（`data` + `schema`）与 `ops` 操作集（setValue/setType/setComment/setOptions/renameKey/deleteNode/addChild） |
| `src/schema.ts` | 纯函数：`JsonValue`/`SchemaNode` 的路径读写、类型推断、值转换、唯一键名 |
| `src/types.ts` | `JsonValue`、`FieldType`、`SchemaNode`、`Path` 定义 |
| `src/components/` | `TreeNode`（递归行）、`ValueEditor`（按类型分发输入控件，含文件上传） |
| `src/api.ts` + `src/global.d.ts` | 渲染进程调用 `window.jsonEditor.*` 的封装与类型声明 |

## 硬性约定

- **数据与注释分离**：注释、字段类型、枚举 options 只进 `schema`（`SchemaNode`），绝不写进 `data`。导出 JSON 必须保持纯净。
- **不可变更新**：任何 `data`/`schema` 修改走 `src/schema.ts` 的路径辅助函数（`setAtPath`、`updateSchemaAtPath` 等），返回新对象，不要原地 mutate。
- **路径寻址**：`Path = (string|number)[]`；数组段是 number，对象段是 string。schema 中对象子节点在 `children[key]`，数组成员共享 `item`。
- **类型切换**：一律走 `ops.setType` → `coerceValue` 转换值；不要在组件里自己转。
- **主进程独占敏感面**：上传、读 `.env`、写文件都在 `electron/`；渲染进程只拿 IPC 结果。新 provider 加在 `upload.ts`，不要漏到 renderer。
- **React**：函数组件 + hooks；样式全在 `styles.css`（CSS 变量主题），不引 UI 库。

## 易踩的坑（改之前先看）

- **ESM 主进程**：`"type": "module"`，electron-vite 产出 ESM main。用 `import.meta.dirname`，禁用 `__dirname`。
- **preload 文件名**：构建产物是 `out/preload/preload.mjs`（不是 index.js）。ESM preload 要求 `sandbox: false`；改了 preload 输出名必须同步 `main.ts` 里的路径。
- **产物目录名**：electron-vite 按入口文件名输出 `out/main/main.js`、`out/renderer/index.html`；`package.json` 的 `main` 字段要对应。
- **COS SDK 是 CJS**：`electron/upload.ts` 里 `await import('cos-nodejs-sdk-v5')` 后取 `.default` 作为构造器；lazy import 是为了让本地-only 使用不加载 SDK。provider 判断以 `isCosConfigured()` 为准，新增 env 时同步改 `cosEnv()` 与 `.env.example`。
- **`webSecurity: false`**：本地 fallback 返回 `file://` URL，预览图片需要它；如要收紧请同步改预览逻辑。
- **IPC 传 ArrayBuffer**：`upload:file` 的 payload 是 `{name, mimeType, data:ArrayBuffer}`，renderer 端先 `file.arrayBuffer()`；不要传 File/Blob 对象（structured clone 不支持）。
- **数组项共享 schema**：`item` 只有一份，不要按索引存 schema；数组删除/重排不影响注释。
- **不要提交**：`.env`、`uploads/`、`out/`、`release/`、`node_modules/`（已在 .gitignore）。`.env` 里可能有真实 COS 密钥，push 前确认没 track。

## 常用片段

新增一个字段类型：在 `types.ts` 的 `FieldType`/`LEAF_TYPES`/`TYPE_LABELS` 加项 → `schema.ts` 补 `defaultValue`/`coerceValue`/`inferType` → `ValueEditor.tsx` 加输入控件分支。

新增一个上传 provider：`upload.ts` 仿 `uploadToCos` 写 `uploadToX` → `isCosConfigured`/provider 选择处加分支 → `.env.example` 补变量 → README「上传配置」节补说明。
