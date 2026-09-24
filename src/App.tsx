import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  PasswordInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconCopy,
  IconDownload,
  IconEraser,
  IconFileImport,
  IconMoon,
  IconPlus,
  IconSchema,
  IconSettings,
  IconSun,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
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
import {
  fetchUploadConfig,
  saveSettings,
  setTheme,
  type SettingsInput,
  type UploadConfig,
} from './api';
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
  const [cfgLoading, setCfgLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [provider, setProvider] = useState<'auto' | 'api'>('auto');
  const [apiUrl, setApiUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);
  const [apiFileField, setApiFileField] = useState('file');
  const [apiUrlField, setApiUrlField] = useState('url');
  const [apiQuery, setApiQuery] = useState<{ key: string; value: string }[]>([]);
  const jsonFileRef = useRef<HTMLInputElement>(null);
  const schemaFileRef = useRef<HTMLInputElement>(null);

  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const computedScheme = useComputedColorScheme('dark');

  useEffect(() => {
    fetchUploadConfig()
      .then(setUploadCfg)
      .catch((e) => setError(`读取上传设置失败: ${e instanceof Error ? e.message : e}`))
      .finally(() => setCfgLoading(false));
  }, []);

  // Keep the OS-level theme (window chrome, prefers-color-scheme) in sync.
  useEffect(() => {
    void setTheme(colorScheme === 'auto' ? 'system' : colorScheme).catch(() => {});
  }, [colorScheme]);

  const toggleTheme = useCallback(() => {
    setColorScheme(computedScheme === 'dark' ? 'light' : 'dark');
  }, [computedScheme, setColorScheme]);

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
    if (!uploadCfg) return;
    const s = uploadCfg.settings;
    setProvider(s.upload.provider);
    setApiUrl(s.upload.api.url);
    setApiToken('');
    setTokenEdited(false);
    setApiFileField(s.upload.api.fileField || 'file');
    setApiUrlField(s.upload.api.urlField || 'url');
    setApiQuery(
      Object.entries(s.upload.api.query ?? {}).map(([key, value]) => ({ key, value })),
    );
    setSettingsOpen(true);
  }, [uploadCfg]);

  const saveSettingsModal = useCallback(() => {
    const token = tokenEdited ? (apiToken.trim() || null) : undefined;
    const next: SettingsInput = {
      upload: {
        provider,
        api: {
          url: apiUrl.trim(),
          token,
          fileField: apiFileField.trim() || 'file',
          urlField: apiUrlField.trim() || 'url',
          query: Object.fromEntries(
            apiQuery
              .map((r) => [r.key.trim(), r.value] as const)
              .filter(([k]) => k),
          ),
        },
      },
    };
    saveSettings(next)
      .then((cfg) => {
        setUploadCfg(cfg);
        setSettingsOpen(false);
      })
      .catch((e) => setError(`保存设置失败: ${e instanceof Error ? e.message : e}`));
  }, [provider, apiUrl, apiToken, tokenEdited, apiFileField, apiUrlField, apiQuery]);

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
    <div className="app">
      <Modal
        title="上传设置"
        opened={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        centered
      >
        <Stack gap="sm" className="settings-form">
          <Select
            label="上传方式"
            value={provider}
            onChange={(v) => setProvider(v === 'api' ? 'api' : 'auto')}
            allowDeselect={false}
            data={[
              { value: 'api', label: '自定义 API（POST 文件，取响应里的 URL）' },
              { value: 'auto', label: '自动（本地应用数据目录）' },
            ]}
          />
          {provider === 'api' && (
            <>
              <TextInput
                label="API 地址"
                placeholder="https://example.com/upload"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
              />
              <PasswordInput
                label="Token（可选，Bearer）"
                placeholder={
                  uploadCfg?.settings.upload.api.hasToken ? '已保存，留空不修改' : '未设置'
                }
                value={apiToken}
                onChange={(e) => {
                  setApiToken(e.target.value);
                  setTokenEdited(true);
                }}
              />
              <TextInput
                label="文件字段名"
                value={apiFileField}
                onChange={(e) => setApiFileField(e.target.value)}
              />
              <TextInput
                label="响应 URL 字段（支持 data.url 嵌套路径）"
                value={apiUrlField}
                onChange={(e) => setApiUrlField(e.target.value)}
              />
              <Text size="sm" c="dimmed" mt="xs">
                Query 参数（拼到上传地址 ? 后面）
              </Text>
              {apiQuery.map((row, i) => (
                <Group key={i} gap="xs" wrap="nowrap">
                  <TextInput
                    placeholder="参数名"
                    value={row.key}
                    style={{ flex: 1 }}
                    onChange={(e) =>
                      setApiQuery((q) =>
                        q.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)),
                      )
                    }
                  />
                  <TextInput
                    placeholder="参数值"
                    value={row.value}
                    style={{ flex: 1 }}
                    onChange={(e) =>
                      setApiQuery((q) =>
                        q.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)),
                      )
                    }
                  />
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    title="删除参数"
                    onClick={() => setApiQuery((q) => q.filter((_, j) => j !== i))}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              ))}
              <Button
                variant="subtle"
                size="xs"
                leftSection={<IconPlus size={14} />}
                style={{ alignSelf: 'flex-start' }}
                onClick={() => setApiQuery((q) => [...q, { key: '', value: '' }])}
              >
                添加参数
              </Button>
            </>
          )}
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={() => setSettingsOpen(false)}>
              取消
            </Button>
            <Button onClick={saveSettingsModal}>保存</Button>
          </Group>
        </Stack>
      </Modal>
      <header className="toolbar">
        <Title order={4} className="app-title">
          JSON 可视化编辑器
        </Title>
        <Group gap="xs" wrap="wrap">
          <Button
            size="sm"
            variant="default"
            leftSection={<IconFileImport size={15} />}
            onClick={() => jsonFileRef.current?.click()}
          >
            导入 JSON
          </Button>
          <Button
            size="sm"
            variant="default"
            leftSection={<IconSchema size={15} />}
            onClick={() => schemaFileRef.current?.click()}
          >
            导入注释 Schema
          </Button>
          <Button
            size="sm"
            variant="default"
            leftSection={<IconDownload size={15} />}
            onClick={() => download('data.json', JSON.stringify(data, null, 2))}
          >
            导出 JSON
          </Button>
          <Button
            size="sm"
            variant="default"
            leftSection={<IconDownload size={15} />}
            onClick={() => download('data.schema.json', JSON.stringify(schema, null, 2))}
          >
            导出 Schema
          </Button>
          <Button
            size="sm"
            variant="default"
            leftSection={<IconCopy size={15} />}
            onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))}
          >
            复制 JSON
          </Button>
          <Button
            size="sm"
            variant="light"
            color="red"
            leftSection={<IconEraser size={15} />}
            onClick={() => {
              setData({});
              setSchema({});
            }}
          >
            清空
          </Button>
        </Group>
        <Badge
          variant="light"
          color="lime"
          leftSection={<IconUpload size={12} />}
          className="provider-tag"
        >
          上传 → {uploadCfg?.label ?? '…'}
        </Badge>
        <ActionIcon
          variant="subtle"
          size="lg"
          title={computedScheme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
          onClick={toggleTheme}
        >
          {computedScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          size="lg"
          title="上传设置"
          loading={cfgLoading}
          disabled={!uploadCfg}
          onClick={openSettings}
        >
          <IconSettings size={18} />
        </ActionIcon>
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
          color="red"
          withCloseButton
          onClose={() => setError(null)}
          className="error-banner"
        >
          {error}
        </Alert>
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
          <SegmentedControl
            size="xs"
            value={previewTab}
            onChange={(v) => setPreviewTab(v as 'json' | 'schema')}
            data={[
              { value: 'json', label: 'JSON' },
              { value: 'schema', label: 'Schema（类型 + 注释）' },
            ]}
          />
          <pre className="preview">{JSON.stringify(preview, null, 2)}</pre>
        </section>
      </main>
    </div>
  );
}
