import { useState } from 'react';
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
    <div className="comment-editor">
      <input
        autoFocus
        value={text}
        placeholder="字段注释…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') onClose();
        }}
        onBlur={commit}
      />
    </div>
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
      <span className="node-name root">root</span>
    ) : onRename ? (
      <input
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
          const input = e.currentTarget;
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') {
            input.value = name;
            input.blur();
          }
        }}
      />
    ) : (
      <span className="node-name index">[{name}]</span>
    );

  const typeSel = (
    <select
      className="type-select"
      value={type}
      onChange={(e) => ops.setType(path, e.target.value as FieldType)}
    >
      {[...LEAF_TYPES, 'object', 'array'].map((t) => (
        <option key={t} value={t}>
          {TYPE_LABELS[t as keyof typeof TYPE_LABELS]}
        </option>
      ))}
    </select>
  );

  const commentBtn = (
    <button
      className={`icon-btn comment-btn ${schema?.comment ? 'has-comment' : ''}`}
      title={schema?.comment ?? '添加注释'}
      onClick={() => setEditingComment((v) => !v)}
    >
      💬
    </button>
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
          <button className="caret" onClick={() => setExpanded((v) => !v)}>
            {expanded ? '▾' : '▸'}
          </button>
          {nameEl}
          <span className="size-badge">
            {type === 'array' ? `${entries.length} 项` : `${entries.length} 字段`}
          </span>
          {typeSel}
          {commentBtn}
          <button className="icon-btn" title="添加子项" onClick={() => ops.addChild(path)}>
            ＋
          </button>
          {onDelete && (
            <button className="icon-btn danger" title="删除" onClick={onDelete}>
              ✕
            </button>
          )}
        </div>
        {commentArea}
        {expanded && (
          <div className="children">
            {entries.map(([k, v]) => {
              const childSchema =
                type === 'array' ? schema?.item : schema?.children?.[k];
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
                  onRename={
                    type === 'object'
                      ? (n) => ops.renameKey(path, k, n)
                      : undefined
                  }
                  onDelete={() => ops.deleteNode(childPath)}
                />
              );
            })}
            {entries.length === 0 && (
              <div className="empty-hint" style={{ paddingLeft: (depth + 1) * 18 }}>
                （空 — 点 ＋ 添加）
              </div>
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
          <input
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
          <button className="icon-btn danger" title="删除" onClick={onDelete}>
            ✕
          </button>
        )}
      </div>
      {commentArea}
    </div>
  );
}
