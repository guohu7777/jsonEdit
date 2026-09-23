import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, ConfigProvider, Segmented, Space, Tag, Typography, theme } from 'antd';
import {
  ClearOutlined,
  CopyOutlined,
  DownloadOutlined,
  FileTextOutlined,
  ImportOutlined,
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
import { fetchUploadConfig, type UploadConfig } from './api';
import { TreeNode } from './components/TreeNode';

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
  title: '示例配置',
  version: 1,
  enabled: true,
  homepage: 'https://example.com',
  coverImage: '',
  tags: ['编辑器', 'JSON'],
  owner: { name: 'Hu', email: 'huc7605@gmail.com' },
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
            <TreeNode value={data} schema={schema} path={[]} depth={0} ops={ops} />
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
