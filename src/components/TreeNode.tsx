import { useState } from 'react';
import { Button, Input, Select, Typography } from 'antd';
import {
  CaretRightOutlined,
  DeleteOutlined,
  MessageOutlined,
  PlusOutlined,
} from '@ant-design/icons';
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
    <Input
      size="small"
      className="comment-input"
      autoFocus
      value={text}
      placeholder="字段注释…"
      onChange={(e) => setText(e.target.value)}
      onPressEnter={commit}
      onBlur={commit}
      onKeyDown={(e) => {
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
      <Typography.Text className="node-name root" italic type="secondary">
        root
      </Typography.Text>
    ) : onRename ? (
      <Input
        size="small"
        className="node-name editable"
        variant="filled"
        defaultValue={name}
        key={name}
        onBlur={(e) => {
          const input = e.currentTarget;
          const v = input.value.trim();
          if (v && v !== name) onRename(v);
          else input.value = name;
        }}
        onPressEnter={(e) => e.currentTarget.blur()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.currentTarget.value = name;
            e.currentTarget.blur();
          }
        }}
      />
    ) : (
      <Typography.Text className="node-name index" type="secondary">
        [{name}]
      </Typography.Text>
    );

  const typeSel = (
    <Select
      size="small"
      className="type-select"
      value={type}
      onChange={(v) => ops.setType(path, v as FieldType)}
      options={[...LEAF_TYPES, 'object', 'array'].map((t) => ({
        value: t as FieldType,
        label: TYPE_LABELS[t as FieldType],
      }))}
    />
  );

  const commentBtn = (
    <Button
      size="small"
      type="text"
      className={schema?.comment ? 'comment-btn has-comment' : 'comment-btn'}
      title={schema?.comment ?? '添加注释'}
      icon={<MessageOutlined />}
      onClick={() => setEditingComment((v) => !v)}
    />
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
          <Button
            size="small"
            type="text"
            className="caret"
            icon={<CaretRightOutlined rotate={expanded ? 90 : 0} />}
            onClick={() => setExpanded((v) => !v)}
          />
          {nameEl}
          <Typography.Text className="size-badge" type="secondary">
            {type === 'array' ? `${entries.length} 项` : `${entries.length} 字段`}
          </Typography.Text>
          {typeSel}
          {commentBtn}
          <Button
            size="small"
            type="text"
            title="添加子项"
            icon={<PlusOutlined />}
            onClick={() => ops.addChild(path)}
          />
          {onDelete && (
            <Button
              size="small"
              type="text"
              danger
              title="删除"
              icon={<DeleteOutlined />}
              onClick={onDelete}
            />
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
              <Typography.Text className="empty-hint" type="secondary" italic>
                （空 — 点 ＋ 添加）
              </Typography.Text>
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
          <Input
            size="small"
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
          <Button
            size="small"
            type="text"
            danger
            title="删除"
            icon={<DeleteOutlined />}
            onClick={onDelete}
          />
        )}
      </div>
      {commentArea}
    </div>
  );
}
