# JSON 可视化编辑器

跨平台 Electron 桌面应用：以树形界面可视化编辑 JSON，支持字段类型、逐字段注释，以及文件字段上传后自动把 URL 写回 JSON。

## 功能

- **树形编辑**：展开/折叠、添加子项、删除节点、双击键名改名（对象）、数组按索引管理
- **字段类型**：每个字段可选择 字符串 / 长文本 / 数字 / 布尔 / 空值 / 链接 / 文件 / 日期 / 颜色 / 枚举 / 对象 / 数组，切换类型时自动按规则转换值
- **字段注释**：点 💬 为任意字段写注释，注释显示在行下方，存于独立的 schema 文件（`data.schema.json`），JSON 数据本身保持纯净
- **文件字段**：类型设为「文件」后出现上传按钮；选择文件后主进程完成上传，返回的 URL 自动写入该字段
- **实时预览**：右侧同时查看 JSON 与 Schema（类型 + 注释）内容
- **导入导出**：导入 JSON（自动推断结构并保留已有注释）、导入/导出 Schema、复制 JSON、清空

## 快速开始

```bash
npm install
npm run dev        # electron-vite 开发模式（热更新）
```

打包：

```bash
npm run build      # 构建 main / preload / renderer 到 out/
npm run dist       # electron-builder 产出安装包（Linux AppImage / mac dmg / win nsis）
npm run pack       # 只解包目录（release/<platform>-unpacked），不产出安装器
npm run typecheck  # tsc -b --noEmit
```

> 需要 Node.js ≥ 20。

## 上传配置

上传目标按优先级生效：**自定义 API（界面配置）→ 腾讯云 COS（.env）→ 本地存储（回退）**。工具栏右上角显示当前生效的上传目标。

### 自定义 API（界面配置）

点击工具栏 ⚙️ 打开上传设置，填写接口地址、可选的 Bearer Token、表单字段名与响应中的 URL 字段名（支持 `data.url` 这类点路径），保存后即作为首选上传方式。设置持久化在 `userData/settings.json`；Token 仅留在主进程，界面不回显，留空表示不修改，清空表示删除。

出于安全考虑，以下地址需要原生对话框确认后才允许使用：明文 `http://`，以及解析到内网/回环地址的域名（解析结果变化时会重新要求确认）。上传时会按确认过的地址集固定 DNS 结果发起请求。

### 腾讯云 COS

文件字段的上传由 Electron **主进程**完成（凭证不进入渲染进程）。复制 `.env.example` 为 `.env`：

```env
COS_SECRET_ID=xxx
COS_SECRET_KEY=xxx
COS_REGION=ap-guangzhou
COS_BUCKET=your-bucket-1234567890
# COS_PREFIX=json-editor        # 可选，对象键前缀
# COS_PUBLIC_BASE=https://cdn.xxx.com  # 可选，CDN/自定义域名
```

`.env` 查找顺序（先命中先用）：

1. 开发模式：项目根目录；打包后：程序可执行文件旁
2. 应用数据目录（`userData`）下的 `.env`

**未配置 COS 时自动回退本地存储**：文件复制到 `userData/uploads/` 并把 `file:///…` 路径写进 JSON，便于零配置试用。工具栏右上角会显示当前生效的上传目标（腾讯云 COS / 本地应用数据目录）。

## 注释 Schema 约定

注释与类型存在一份与 JSON 结构平行的 `SchemaNode` 树中：

```jsonc
{
  "children": {
    "title": { "comment": "显示在首页" },
    "coverImage": { "type": "file" },
    "tags": { "item": { "comment": "数组项共用一份注释" } }
  }
}
```

- `children` 对应对象的键，`item` 对应数组元素（所有数组项共用同一份注释/类型）
- `type` 仅在用户改过字段类型时写入；`options` 为枚举类型的可选值
- 导出 `data.schema.json` 后可随 `data.json` 一起分发/再导入

## 目录结构

```
electron/
  main.ts      # Electron 主进程：窗口、IPC（upload:config / upload:file）
  preload.ts   # contextBridge 暴露 window.jsonEditor
  upload.ts    # 上传 provider：腾讯云 COS / 本地 userData fallback
  env.ts       # .env 解析
src/
  App.tsx      # 状态（data + schema）与全部编辑操作 ops
  schema.ts    # JsonValue/Schema 的纯函数操作（路径读写、类型推断/转换）
  components/  # TreeNode（递归树行）、ValueEditor（按类型的输入控件）
  api.ts       # 渲染进程侧 IPC 封装
electron.vite.config.ts  # electron-vite 三端构建
```

技术栈：Electron + electron-vite + React 19 + TypeScript + cos-nodejs-sdk-v5。
