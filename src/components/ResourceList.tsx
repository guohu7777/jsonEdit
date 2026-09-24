import { useState } from 'react';
import { ActionIcon, Button, Checkbox, Select, Text, TextInput } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconPlus, IconTrash } from '@tabler/icons-react';
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
        <TextInput
          size="xs"
          className="res-id mono"
          placeholder="id"
          value={typeof field('id') === 'string' ? (field('id') as string) : ''}
          onChange={(e) => ops.setValue(fieldPath('id'), e.target.value)}
        />
        <TextInput
          size="xs"
          className="res-name"
          placeholder="名称"
          value={typeof field('name') === 'string' ? (field('name') as string) : ''}
          onChange={(e) => ops.setValue(fieldPath('name'), e.target.value)}
        />
        <Select
          size="xs"
          className="res-type"
          value={typeof field('type') === 'string' ? (field('type') as string) : 'image'}
          data={typeOptions}
          allowDeselect={false}
          onChange={(v) => ops.setValue(fieldPath('type'), v ?? 'image')}
        />
        <ValueEditor
          type="file"
          value={field('url') ?? ''}
          mediaHint={
            field('type') === 'video'
              ? 'video'
              : field('type') === 'image'
                ? 'image'
                : undefined
          }
          onChange={(v) => ops.setValue(fieldPath('url'), v)}
        />
        <Checkbox
          size="xs"
          checked={field('cache') === true}
          onChange={(e) =>
            e.target.checked
              ? ops.setValue(fieldPath('cache'), true)
              : ops.deleteNode(fieldPath('cache'))
          }
        />
        {extraKeys.length > 0 && (
          <ActionIcon
            size="sm"
            variant="subtle"
            title="其他字段"
            onClick={() => setShowExtra((v) => !v)}
          >
            {showExtra ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          </ActionIcon>
        )}
        <ActionIcon
          size="sm"
          variant="subtle"
          color="red"
          title="删除资源"
          onClick={onDelete}
        >
          <IconTrash size={14} />
        </ActionIcon>
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
        <Text c="dimmed" size="xs" span>
          ID
        </Text>
        <Text c="dimmed" size="xs" span>
          名称
        </Text>
        <Text c="dimmed" size="xs" span>
          类型
        </Text>
        <Text c="dimmed" size="xs" span>
          URL（点上传自动填入）
        </Text>
        <Text c="dimmed" size="xs" span>
          缓存
        </Text>
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
        size="xs"
        variant="default"
        fullWidth
        leftSection={<IconPlus size={14} />}
        className="res-add"
        style={{ borderStyle: 'dashed' }}
        onClick={onAdd}
      >
        添加资源
      </Button>
    </div>
  );
}
