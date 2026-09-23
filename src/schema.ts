import type { FieldType, JsonValue, Path, SchemaNode } from './types';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const URL_RE = /^https?:\/\/\S+$/;

export function inferType(value: JsonValue): FieldType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'object':
      return 'object';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'string':
      if (URL_RE.test(value)) return 'url';
      if (ISO_DATE_RE.test(value)) return 'date';
      return 'string';
  }
}

export function inferSchema(value: JsonValue): SchemaNode {
  const node: SchemaNode = {};
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    node.children = {};
    for (const k of Object.keys(value)) {
      node.children[k] = inferSchema((value as Record<string, JsonValue>)[k]);
    }
  } else if (Array.isArray(value)) {
    node.item = value.length > 0 ? inferSchema(value[0]) : {};
  }
  return node;
}

export function nodeType(value: JsonValue, schema: SchemaNode | undefined): FieldType {
  return schema?.type ?? inferType(value);
}

export function schemaForPath(schema: SchemaNode | undefined, path: Path): SchemaNode | undefined {
  let cur = schema;
  for (const seg of path) {
    if (!cur) return undefined;
    if (typeof seg === 'number') cur = cur.item;
    else cur = cur.children?.[seg];
  }
  return cur;
}

export function updateSchemaAtPath(
  root: SchemaNode,
  path: Path,
  patch: Partial<SchemaNode>,
): SchemaNode {
  if (path.length === 0) return { ...root, ...patch };
  const [head, ...rest] = path;
  const clone: SchemaNode = { ...root };
  if (typeof head === 'number') {
    clone.item = updateSchemaAtPath(root.item ?? {}, rest, patch);
  } else {
    clone.children = { ...(root.children ?? {}) };
    clone.children[head] = updateSchemaAtPath(clone.children[head] ?? {}, rest, patch);
  }
  return clone;
}

export function renameSchemaChild(root: SchemaNode, parentPath: Path, oldKey: string, newKey: string): SchemaNode {
  if (parentPath.length === 0) {
    const children = root.children ?? {};
    if (!(oldKey in children)) return root;
    const next: Record<string, SchemaNode> = {};
    for (const [k, v] of Object.entries(children)) {
      next[k === oldKey ? newKey : k] = v;
    }
    return { ...root, children: next };
  }
  const [head, ...rest] = parentPath;
  const clone: SchemaNode = { ...root };
  if (typeof head === 'number') {
    clone.item = renameSchemaChild(root.item ?? {}, rest, oldKey, newKey);
  } else {
    clone.children = { ...(root.children ?? {}) };
    clone.children[head] = renameSchemaChild(clone.children[head] ?? {}, rest, oldKey, newKey);
  }
  return clone;
}

export function deleteSchemaChild(root: SchemaNode, parentPath: Path, key: string): SchemaNode {
  if (parentPath.length === 0) {
    if (!root.children || !(key in root.children)) return root;
    const next = { ...root.children };
    delete next[key];
    return { ...root, children: next };
  }
  const [head, ...rest] = parentPath;
  const clone: SchemaNode = { ...root };
  if (typeof head === 'number') {
    clone.item = deleteSchemaChild(root.item ?? {}, rest, key);
  } else {
    clone.children = { ...(root.children ?? {}) };
    clone.children[head] = deleteSchemaChild(clone.children[head] ?? {}, rest, key);
  }
  return clone;
}

export function defaultValue(type: FieldType, options?: string[]): JsonValue {
  switch (type) {
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'null':
      return null;
    case 'object':
      return {};
    case 'array':
      return [];
    case 'date':
      return new Date().toISOString().slice(0, 10);
    case 'color':
      return '#3b82f6';
    case 'select':
      return options?.[0] ?? '';
    default:
      return '';
  }
}

export function coerceValue(value: JsonValue, type: FieldType, options?: string[]): JsonValue {
  switch (type) {
    case 'string':
    case 'longtext':
    case 'url':
    case 'file':
      return value === null || typeof value === 'object' ? '' : String(value);
    case 'date': {
      if (typeof value === 'string' && ISO_DATE_RE.test(value)) return value;
      return new Date().toISOString().slice(0, 10);
    }
    case 'color':
      return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : '#3b82f6';
    case 'select':
      return typeof value === 'string' && options?.includes(value) ? value : (options?.[0] ?? '');
    case 'number': {
      const n = typeof value === 'number' ? value : parseFloat(String(value));
      return Number.isFinite(n) ? n : 0;
    }
    case 'boolean':
      return value === true || value === 'true' || value === 1;
    case 'null':
      return null;
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
    case 'array':
      return Array.isArray(value) ? value : [];
  }
}

export function getAtPath(data: JsonValue, path: Path): JsonValue {
  let cur: JsonValue = data;
  for (const seg of path) {
    if (cur === null || typeof cur !== 'object') return null;
    cur = Array.isArray(cur)
      ? (cur[seg as number] ?? null)
      : ((cur as Record<string, JsonValue>)[seg as string] ?? null);
  }
  return cur;
}

export function setAtPath(data: JsonValue, path: Path, value: JsonValue): JsonValue {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (Array.isArray(data)) {
    const idx = typeof head === 'number' ? head : parseInt(head, 10);
    const next = [...data];
    next[idx] = setAtPath(next[idx] ?? null, rest, value);
    return next;
  }
  const obj = typeof data === 'object' && data !== null ? (data as Record<string, JsonValue>) : {};
  return { ...obj, [String(head)]: setAtPath(obj[String(head)] ?? null, rest, value) };
}

export function deleteAtPath(data: JsonValue, path: Path): JsonValue {
  if (path.length === 0) return data;
  const [head, ...rest] = path;
  if (Array.isArray(data)) {
    const idx = typeof head === 'number' ? head : parseInt(head, 10);
    const next = [...data];
    if (rest.length === 0) next.splice(idx, 1);
    else next[idx] = deleteAtPath(next[idx], rest);
    return next;
  }
  if (typeof data !== 'object' || data === null) return data;
  const obj = { ...(data as Record<string, JsonValue>) };
  if (rest.length === 0) delete obj[String(head)];
  else obj[String(head)] = deleteAtPath(obj[String(head)] ?? null, rest);
  return obj;
}

export function renameKeyAtPath(
  data: JsonValue,
  parentPath: Path,
  oldKey: string,
  newKey: string,
): JsonValue {
  const parent = getAtPath(data, parentPath);
  if (typeof parent !== 'object' || parent === null || Array.isArray(parent)) return data;
  if (!(oldKey in parent) || oldKey === newKey || newKey in parent) return data;
  const next: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(parent)) {
    next[k === oldKey ? newKey : k] = v;
  }
  return setAtPath(data, parentPath, next);
}

export function uniqueKey(existing: Record<string, JsonValue>, base = 'newKey'): string {
  if (!(base in existing)) return base;
  let i = 1;
  while (`${base}${i}` in existing) i++;
  return `${base}${i}`;
}
