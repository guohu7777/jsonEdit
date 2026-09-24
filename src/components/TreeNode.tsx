import { useState } from 'react';
import { ActionIcon, Select, Text, TextInput } from '@mantine/core';
import {
  IconChevronRight,
  IconMessage,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import type { FieldType, JsonValue, Path, SchemaNode } from '../types';
import { LEAF_TYPES, TYPE_LABELS } from '../types';
import { nodeType } from '../schema';
import type { Ops } from '../App';
import { ValueEditor } from './ValueEditor';

interface Props {
  name?: string;
  value: JsonValue;
  schema?: SchemaNode;
  path: Path;
  depth: number;
  ops: Ops;
  onRename?: (newName: string) => void;
  onDelete?: () => void;
}

function CommentEditor({
  comment,
  onCommit,
  onClose,
}: {
  comment: string;
  onCommit: (c: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(comment);
  const commit = () => {
    onCommit(text.trim());
    onClose();
  };
  return (
    <TextInput
      size="xs"
      className="comment-input"
      autoFocus
      value={text}
      placeholder="字段注释…"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onClose();
      }}
    />
  );
}

export function TreeNode({ name, value, schema, path, depth, ops, onRename, onDelete }: Props) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [editingComment, setEditingComment] = useState(false);
  const type = nodeType(value, schema);
  const isContainer = type === 'object' || type === 'array';
  const indent = { paddingLeft: depth * 18 };

  const nameEl =
    name === undefined ? (
      <Text className="node-name root" fs="italic" c="dimmed" size="xs" span>
        root
      </Text>
    ) : onRename ? (
      <TextInput
        size="xs"
        variant="filled"
        className="node-name editable"
        defaultValue={name}
        key={name}
        onBlur={(e) => {
          const input = e.currentTarget;
          const v = input.value.trim();
          if (v && v !== name) onRename(v);
          else input.value = name;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            e.currentTarget.value = name;
            e.currentTarget.blur();
          }
        }}
      />
    ) : (
      <Text className="node-name index" c="dimmed" size="xs" span>
        [{name}]
      </Text>
    );

  const typeSel = (
    <Select
      size="xs"
      className="type-select"
      value={type}
      allowDeselect={false}
      onChange={(v) => v && ops.setType(path, v as FieldType)}
      data={[...LEAF_TYPES, 'object', 'array'].map((t) => ({
        value: t as FieldType,
        label: TYPE_LABELS[t as FieldType],
      }))}
    />
  );

  const commentBtn = (
    <ActionIcon
      size="sm"
      variant="subtle"
      color={schema?.comment ? 'yellow' : undefined}
      className="comment-btn"
      title={schema?.comment ?? '添加注释'}
      onClick={() => setEditingComment((v) => !v)}
    >
      <IconMessage size={14} />
    </ActionIcon>
  );

  const commentArea = (
    <>
      {schema?.comment && !editingComment && (
        <div className="comment-text" style={indent}>
          {schema.comment}
        </div>
      )}
      {editingComment && (
        <div style={indent}>
          <CommentEditor
            comment={schema?.comment ?? ''}
            onCommit={(c) => ops.setComment(path, c)}
            onClose={() => setEditingComment(false)}
          />
        </div>
      )}
    </>
  );

  if (isContainer) {
    const entries: [string, JsonValue][] =
      type === 'array'
        ? (value as JsonValue[]).map((v, i) => [String(i), v])
        : Object.entries(value as Record<string, JsonValue>);
    return (
      <div className="node">
        <div className="node-row" style={indent}>
          <ActionIcon
            size="sm"
            variant="subtle"
            className="caret"
            onClick={() => setExpanded((v) => !v)}
          >
            <IconChevronRight
              size={14}
              style={{
                transform: expanded ? 'rotate(90deg)' : 'none',
                transition: 'transform 150ms',
              }}
            />
          </ActionIcon>
          {nameEl}
          <Text className="size-badge" c="dimmed" size="xs" span>
            {type === 'array' ? `${entries.length} 项` : `${entries.length} 字段`}
          </Text>
          {typeSel}
          {commentBtn}
          <ActionIcon
            size="sm"
            variant="subtle"
            title="添加子项"
            onClick={() => ops.addChild(path)}
          >
            <IconPlus size={14} />
          </ActionIcon>
          {onDelete && (
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              title="删除"
              onClick={onDelete}
            >
              <IconTrash size={14} />
            </ActionIcon>
          )}
        </div>
        {commentArea}
        {expanded && (
          <div className="children">
            {entries.map(([k, v]) => {
              const childSchema = type === 'array' ? schema?.item : schema?.children?.[k];
              const childPath = type === 'array' ? [...path, Number(k)] : [...path, k];
              return (
                <TreeNode
                  key={k}
                  name={k}
                  value={v}
                  schema={childSchema}
                  path={childPath}
                  depth={depth + 1}
                  ops={ops}
                  onRename={type === 'object' ? (n) => ops.renameKey(path, k, n) : undefined}
                  onDelete={() => ops.deleteNode(childPath)}
                />
              );
            })}
            {entries.length === 0 && (
              <Text className="empty-hint" c="dimmed" fs="italic" size="xs" span>
                （空 — 点 ＋ 添加）
              </Text>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="node">
      <div className="node-row" style={indent}>
        <span className="caret-placeholder" />
        {nameEl}
        {typeSel}
        <ValueEditor
          type={type}
          value={value}
          options={schema?.options}
          onChange={(v) => ops.setValue(path, v)}
        />
        {type === 'select' && (
          <TextInput
            size="xs"
            className="options-input"
            placeholder="枚举值,逗号分隔"
            defaultValue={(schema?.options ?? []).join(',')}
            key={(schema?.options ?? []).join(',')}
            onBlur={(e) =>
              ops.setOptions(
                path,
                e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          />
        )}
        {commentBtn}
        {onDelete && (
          <ActionIcon
            size="sm"
            variant="subtle"
            color="red"
            title="删除"
            onClick={onDelete}
          >
            <IconTrash size={14} />
          </ActionIcon>
        )}
      </div>
      {commentArea}
    </div>
  );
}
