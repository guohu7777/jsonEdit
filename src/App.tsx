import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    <div className="app">
      <header className="toolbar">
        <h1>JSON 可视化编辑器</h1>
        <div className="actions">
          <button onClick={() => jsonFileRef.current?.click()}>导入 JSON</button>
          <button onClick={() => schemaFileRef.current?.click()}>导入注释 Schema</button>
          <button onClick={() => download('data.json', JSON.stringify(data, null, 2))}>
            导出 JSON
          </button>
          <button onClick={() => download('data.schema.json', JSON.stringify(schema, null, 2))}>
            导出 Schema
          </button>
          <button onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))}>
            复制 JSON
          </button>
          <button
            onClick={() => {
              setData({});
              setSchema({});
            }}
          >
            清空
          </button>
        </div>
        <span className="provider">上传 → {uploadCfg?.label ?? '…'}</span>
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

      {error && <div className="error-banner">{error}</div>}

      <main className="panes">
        <section className="tree-pane">
          <TreeNode
            value={data}
            schema={schema}
            path={[]}
            depth={0}
            ops={ops}
          />
        </section>
        <section className="preview-pane">
          <div className="preview-tabs">
            <button
              className={previewTab === 'json' ? 'active' : ''}
              onClick={() => setPreviewTab('json')}
            >
              JSON
            </button>
            <button
              className={previewTab === 'schema' ? 'active' : ''}
              onClick={() => setPreviewTab('schema')}
            >
              Schema（类型 + 注释）
            </button>
          </div>
          <pre className="preview">{JSON.stringify(preview, null, 2)}</pre>
        </section>
      </main>
    </div>
  );
}
