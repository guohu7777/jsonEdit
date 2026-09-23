import { useState } from 'react';
import { Button, Checkbox, Input, Select, Typography } from 'antd';
import { DeleteOutlined, DownOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import type { JsonValue, Path, SchemaNode } from '../types';
import type { Ops } from '../App';
import { ValueEditor } from './ValueEditor';
import { TreeNode } from './TreeNode';

const RESOURCE_TYPES = ['image', 'video'];
const KNOWN_KEYS = new Set(['id', 'name', 'url', 'cache', 'type']);

function isObj(v: JsonValue): v is Record<string, JsonValue> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

interface ItemProps {
  item: Record<string, JsonValue>;
  itemSchema?: SchemaNode;
  itemPath: Path;
  ops: Ops;
  onDelete: () => void;
}

function ResourceItem({ item, itemSchema, itemPath, ops, onDelete }: ItemProps) {
  const [showExtra, setShowExtra] = useState(false);
  const field = (k: string) => item[k];
  const fieldPath = (k: string): Path => [...itemPath, k];
  const extraKeys = Object.keys(item).filter((k) => !KNOWN_KEYS.has(k));
  const typeOptions = itemSchema?.children?.type?.options ?? RESOURCE_TYPES;

  return (
    <div className="res-item">
      <div className="res-row">
        <Input
          size="small"
          className="res-id mono"
          placeholder="id"
          value={typeof field('id') === 'string' ? (field('id') as string) : ''}
          onChange={(e) => ops.setValue(fieldPath('id'), e.target.value)}
        />
        <Input
          size="small"
          className="res-name"
          placeholder="名称"
          value={typeof field('name') === 'string' ? (field('name') as string) : ''}
          onChange={(e) => ops.setValue(fieldPath('name'), e.target.value)}
        />
        <Select
          size="small"
          className="res-type"
          value={typeof field('type') === 'string' ? (field('type') as string) : 'image'}
          options={typeOptions.map((t) => ({ value: t, label: t }))}
          onChange={(v) => ops.setValue(fieldPath('type'), v)}
        />
        <ValueEditor
          type="file"
          value={field('url') ?? ''}
          onChange={(v) => ops.setValue(fieldPath('url'), v)}
        />
        <Checkbox
          checked={field('cache') === true}
          onChange={(e) =>
            e.target.checked
              ? ops.setValue(fieldPath('cache'), true)
              : ops.deleteNode(fieldPath('cache'))
          }
        />
        {extraKeys.length > 0 && (
          <Button
            size="small"
            type="text"
            title="其他字段"
            icon={showExtra ? <DownOutlined /> : <RightOutlined />}
            onClick={() => setShowExtra((v) => !v)}
          />
        )}
        <Button
          size="small"
          type="text"
          danger
          title="删除资源"
          icon={<DeleteOutlined />}
          onClick={onDelete}
        />
      </div>
      {showExtra && (
        <div className="res-extra">
          {extraKeys.map((k) => (
            <TreeNode
              key={k}
              name={k}
              value={item[k]}
              schema={itemSchema?.children?.[k]}
              path={fieldPath(k)}
              depth={0}
              ops={ops}
              onRename={(n) => ops.renameKey(itemPath, k, n)}
              onDelete={() => ops.deleteNode(fieldPath(k))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  items: JsonValue[];
  itemSchema?: SchemaNode;
  path: Path;
  ops: Ops;
  onAdd: () => void;
}

export function ResourceList({ items, itemSchema, path, ops, onAdd }: Props) {
  return (
    <div className="res-list">
      <div className="res-row res-header">
        <Typography.Text type="secondary">ID</Typography.Text>
        <Typography.Text type="secondary">名称</Typography.Text>
        <Typography.Text type="secondary">类型</Typography.Text>
        <Typography.Text type="secondary">URL（点上传自动填入）</Typography.Text>
        <Typography.Text type="secondary">缓存</Typography.Text>
        <span />
        <span />
      </div>
      {items.map((item, i) =>
        isObj(item) ? (
          <ResourceItem
            key={i}
            item={item}
            itemSchema={itemSchema}
            itemPath={[...path, i]}
            ops={ops}
            onDelete={() => ops.deleteNode([...path, i])}
          />
        ) : (
          <TreeNode
            key={i}
            name={String(i)}
            value={item}
            path={[...path, i]}
            depth={0}
            ops={ops}
            onDelete={() => ops.deleteNode([...path, i])}
          />
        ),
      )}
      <Button
        size="small"
        type="dashed"
        block
        icon={<PlusOutlined />}
        className="res-add"
        onClick={onAdd}
      >
        添加资源
      </Button>
    </div>
  );
}
