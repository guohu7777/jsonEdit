export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type FieldType =
  | 'string'
  | 'longtext'
  | 'number'
  | 'boolean'
  | 'null'
  | 'url'
  | 'file'
  | 'date'
  | 'color'
  | 'select'
  | 'object'
  | 'array';

export const LEAF_TYPES: FieldType[] = [
  'string',
  'longtext',
  'number',
  'boolean',
  'null',
  'url',
  'file',
  'date',
  'color',
  'select',
];

export const TYPE_LABELS: Record<FieldType, string> = {
  string: '字符串',
  longtext: '长文本',
  number: '数字',
  boolean: '布尔',
  null: '空值',
  url: '链接',
  file: '文件',
  date: '日期',
  color: '颜色',
  select: '枚举',
  object: '对象',
  array: '数组',
};

export interface SchemaNode {
  type?: FieldType;
  comment?: string;
  options?: string[];
  children?: Record<string, SchemaNode>;
  item?: SchemaNode;
}

export type Path = (string | number)[];
