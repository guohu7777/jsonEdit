import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  ConfigProvider,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  ClearOutlined,
  CopyOutlined,
  DownloadOutlined,
  FileTextOutlined,
  ImportOutlined,
  SettingOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import 'dayjs/locale/zh-cn';
import type { FieldType, JsonValue, Path, SchemaNode } from './types';
import {
  coerceValue,
  defaultValue,
  deleteAtPath,
  deleteSchemaChild,
  getAtPath,
  inferSchema,
  inferType,
  renameKeyAtPath,
  renameSchemaChild,
  schemaForPath,
  setAtPath,
  uniqueKey,
  updateSchemaAtPath,
} from './schema';
import { fetchUploadConfig, saveSettings, type Settings, type UploadConfig } from './api';
import { TreeNode } from './components/TreeNode';
import { ResourceList } from './components/ResourceList';

export interface Ops {
  setValue(path: Path, value: JsonValue): void;
  setType(path: Path, type: FieldType): void;
  setComment(path: Path, comment: string): void;
  setOptions(path: Path, options: string[]): void;
  renameKey(parentPath: Path, oldKey: string, newKey: string): void;
  deleteNode(path: Path): void;
  addChild(parentPath: Path): void;
}

const SAMPLE: JsonValue = {
  resource: [
    {
      id: 'sj_s',
      name: '时间案开始',
      url: 'https://cdn1.cos.jufunny.com/static/game/zm/homeRoundImages/sj_s.png',
      cache: true,
      type: 'image',
    },
    {
      id: 'jk_s1',
      name: '监控视频1',
      url: 'https://cdn1.cos.jufunny.com/image/2026-09-22/E6ECBB76E74F374E802940B8465BDA6A3E7A9E8AFC312530C9DBFFC31B488B50.mp4',
      type: 'video',
    },
    {
      id: 'bg',
      name: '背景图',
      url: 'https://cdn1.cos.jufunny.com/static/images/game/zm/player/bg.png',
      type: 'image',
    },
  ],
};

function mergeSchema(value: JsonValue, old: SchemaNode | undefined): SchemaNode {
  // Re-infer the shape for the new value while preserving annotations whose
  // position (keys / array item) still exists.
  const base: SchemaNode = { ...(old ?? {}) };
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const children: Record<string, SchemaNode> = {};
    for (const k of Object.keys(value)) {
      children[k] = mergeSchema((value as Record<string, JsonValue>)[k], old?.children?.[k]);
    }
    base.children = children;
  } else if (Array.isArray(value)) {
    base.children = undefined;
    base.item = value.length > 0 ? mergeSchema(value[0], old?.item) : (old?.item ?? {});
  } else {
    base.children = undefined;
    base.item = undefined;
  }
  return base;
}

export default function App() {
  const [data, setData] = useState<JsonValue>(SAMPLE);
  const [schema, setSchema] = useState<SchemaNode>(() => inferSchema(SAMPLE));
  const [uploadCfg, setUploadCfg] = useState<UploadConfig | null>(null);
  const [previewTab, setPreviewTab] = useState<'json' | 'schema'>('json');
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [provider, setProvider] = useState<'auto' | 'api'>('auto');
  const [apiUrl, setApiUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [apiFileField, setApiFileField] = useState('file');
  const [apiUrlField, setApiUrlField] = useState('url');
  const jsonFileRef = useRef<HTMLInputElement>(null);
  const schemaFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchUploadConfig().then(setUploadCfg).catch(() => setUploadCfg(null));
  }, []);

  const ops: Ops = useMemo(
    () => ({
      setValue: (path, value) => setData((d) => setAtPath(d, path, value)),
      setType: (path, type) => {
        setSchema((s) => updateSchemaAtPath(s, path, { type }));
        setData((d) => {
          const opts = schemaForPath(schema, path)?.options;
          return setAtPath(d, path, coerceValue(getAtPath(d, path), type, opts));
        });
      },
      setComment: (path, comment) =>
        setSchema((s) => updateSchemaAtPath(s, path, { comment: comment || undefined })),
      setOptions: (path, options) =>
        setSchema((s) => updateSchemaAtPath(s, path, { options })),
      renameKey: (parentPath, oldKey, newKey) => {
        setData((d) => renameKeyAtPath(d, parentPath, oldKey, newKey));
        setSchema((s) => renameSchemaChild(s, parentPath, oldKey, newKey));
      },
      deleteNode: (path) => {
        const [key, ...parentRev] = [...path].reverse();
        const parentPath = parentRev.reverse();
        setData((d) => deleteAtPath(d, path));
        if (typeof key === 'string') {
          setSchema((s) => deleteSchemaChild(s, parentPath, key));
        }
      },
      addChild: (parentPath) =>
        setData((d) => {
          const parent = getAtPath(d, parentPath);
          const ps = schemaForPath(schema, parentPath);
          if (Array.isArray(parent)) {
            const itemType = ps?.item?.type ?? (parent.length ? inferType(parent[0]) : 'string');
            return setAtPath(d, [...parentPath, parent.length], defaultValue(itemType, ps?.item?.options));
          }
          if (parent !== null && typeof parent === 'object') {
            const key = uniqueKey(parent as Record<string, JsonValue>);
            return setAtPath(d, [...parentPath, key], '');
          }
          return d;
        }),
    }),
    [schema],
  );

  const openSettings = useCallback(() => {
    const s = uploadCfg?.settings;
    setProvider(s?.upload.provider ?? 'auto');
    setApiUrl(s?.upload.api.url ?? '');
    setApiToken(s?.upload.api.token ?? '');
    setApiFileField(s?.upload.api.fileField || 'file');
    setApiUrlField(s?.upload.api.urlField || 'url');
    setSettingsOpen(true);
  }, [uploadCfg]);

  const saveSettingsModal = useCallback(() => {
    const next: Settings = {
      upload: {
        provider,
        api: {
          url: apiUrl.trim(),
          token: apiToken.trim() || undefined,
          fileField: apiFileField.trim() || 'file',
          urlField: apiUrlField.trim() || 'url',
        },
      },
    };
    saveSettings(next)
      .then((cfg) => {
        setUploadCfg(cfg);
        setSettingsOpen(false);
      })
      .catch((e) => setError(`保存设置失败: ${e instanceof Error ? e.message : e}`));
  }, [provider, apiUrl, apiToken, apiFileField, apiUrlField]);

  const importJson = useCallback((file: File) => {
    file
      .text()
      .then((text) => {
        const parsed = JSON.parse(text) as JsonValue;
        setData(parsed);
        setSchema((s) => mergeSchema(parsed, s));
        setError(null);
      })
      .catch((e) => setError(`JSON 解析失败: ${e instanceof Error ? e.message : e}`));
  }, []);

  const importSchema = useCallback((file: File) => {
    file
      .text()
      .then((text) => {
        setSchema(JSON.parse(text) as SchemaNode);
        setError(null);
      })
      .catch((e) => setError(`Schema 解析失败: ${e instanceof Error ? e.message : e}`));
  }, []);

  const download = useCallback((name: string, content: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  const preview = previewTab === 'json' ? data : schema;

  const resourceItems =
    data !== null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Array.isArray((data as Record<string, JsonValue>).resource)
      ? ((data as Record<string, JsonValue>).resource as JsonValue[])
      : null;
  const otherKeys = resourceItems
    ? Object.keys(data as Record<string, JsonValue>).filter((k) => k !== 'resource')
    : [];

  const addResource = useCallback(() => {
    setData((d) => {
      const arr = resourceItems ?? [];
      return setAtPath(d, ['resource', arr.length], {
        id: '',
        name: '',
        url: '',
        type: 'image',
      });
    });
  }, [resourceItems]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#3b82f6',
          borderRadius: 6,
          fontFamily:
            "-apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
        },
        components: {
          Select: { optionSelectedBg: '#1e3a5f' },
        },
      }}
    >
      <div className="app">
        <Modal
          title="上传设置"
          open={settingsOpen}
          onOk={saveSettingsModal}
          onCancel={() => setSettingsOpen(false)}
          okText="保存"
          cancelText="取消"
          destroyOnHidden
        >
          <div className="settings-form">
            <label className="settings-label">上传方式</label>
            <Select
              className="settings-field"
              value={provider}
              onChange={(v) => setProvider(v)}
              options={[
                { value: 'api', label: '自定义 API（POST 文件，取响应里的 URL）' },
                { value: 'auto', label: '自动（.env 配了 COS 走 COS，否则本地目录）' },
              ]}
            />
            {provider === 'api' && (
              <>
                <label className="settings-label">API 地址</label>
                <Input
                  className="settings-field"
                  placeholder="https://example.com/upload"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                />
                <label className="settings-label">Token（可选，Bearer）</label>
                <Input.Password
                  className="settings-field"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                />
                <label className="settings-label">文件字段名</label>
                <Input
                  className="settings-field"
                  value={apiFileField}
                  onChange={(e) => setApiFileField(e.target.value)}
                />
                <label className="settings-label">响应 URL 字段（支持 data.url 嵌套路径）</label>
                <Input
                  className="settings-field"
                  value={apiUrlField}
                  onChange={(e) => setApiUrlField(e.target.value)}
                />
              </>
            )}
          </div>
        </Modal>
        <header className="toolbar">
          <Typography.Title level={4} className="app-title">
            JSON 可视化编辑器
          </Typography.Title>
          <Space size="small" wrap>
            <Button icon={<ImportOutlined />} onClick={() => jsonFileRef.current?.click()}>
              导入 JSON
            </Button>
            <Button icon={<FileTextOutlined />} onClick={() => schemaFileRef.current?.click()}>
              导入注释 Schema
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={() => download('data.json', JSON.stringify(data, null, 2))}
            >
              导出 JSON
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={() => download('data.schema.json', JSON.stringify(schema, null, 2))}
            >
              导出 Schema
            </Button>
            <Button
              icon={<CopyOutlined />}
              onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))}
            >
              复制 JSON
            </Button>
            <Button
              danger
              icon={<ClearOutlined />}
              onClick={() => {
                setData({});
                setSchema({});
              }}
            >
              清空
            </Button>
          </Space>
          <Tag icon={<UploadOutlined />} color="blue" className="provider-tag">
            上传 → {uploadCfg?.label ?? '…'}
          </Tag>
          <Button
            type="text"
            icon={<SettingOutlined />}
            title="上传设置"
            onClick={openSettings}
          />
          <input
            ref={jsonFileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = '';
            }}
          />
          <input
            ref={schemaFileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importSchema(f);
              e.target.value = '';
            }}
          />
        </header>

        {error && (
          <Alert
            type="error"
            message={error}
            closable
            onClose={() => setError(null)}
            className="error-banner"
          />
        )}

        <main className="panes">
          <section className="tree-pane">
            {resourceItems ? (
              <>
                <ResourceList
                  items={resourceItems}
                  itemSchema={schemaForPath(schema, ['resource'])?.item}
                  path={['resource']}
                  ops={ops}
                  onAdd={addResource}
                />
                {otherKeys.map((k) => (
                  <TreeNode
                    key={k}
                    name={k}
                    value={(data as Record<string, JsonValue>)[k]}
                    schema={schema.children?.[k]}
                    path={[k]}
                    depth={0}
                    ops={ops}
                    onRename={(n) => ops.renameKey([], k, n)}
                    onDelete={() => ops.deleteNode([k])}
                  />
                ))}
              </>
            ) : (
              <TreeNode value={data} schema={schema} path={[]} depth={0} ops={ops} />
            )}
          </section>
          <section className="preview-pane">
            <Segmented
              value={previewTab}
              onChange={(v) => setPreviewTab(v as 'json' | 'schema')}
              options={[
                { value: 'json', label: 'JSON' },
                { value: 'schema', label: 'Schema（类型 + 注释）' },
              ]}
            />
            <pre className="preview">{JSON.stringify(preview, null, 2)}</pre>
          </section>
        </main>
      </div>
    </ConfigProvider>
  );
}
