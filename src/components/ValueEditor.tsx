import { useRef, useState } from 'react';
import { Button, Checkbox, ColorPicker, DatePicker, Input, InputNumber, Select, Typography } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { FieldType, JsonValue } from '../types';
import { uploadFile } from '../api';

interface Props {
  type: FieldType;
  value: JsonValue;
  options?: string[];
  onChange: (value: JsonValue) => void;
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?.*)?$/i;

function FileEditor({ value, onChange }: { value: JsonValue; onChange: (v: JsonValue) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = typeof value === 'string' ? value : '';

  const pick = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="file-editor">
      <Input
        size="small"
        className="value-input url"
        value={url}
        placeholder="上传后自动填入 URL"
        onChange={(e) => onChange(e.target.value)}
      />
      <Button
        size="small"
        type="primary"
        icon={<UploadOutlined />}
        loading={busy}
        onClick={() => fileRef.current?.click()}
      >
        上传文件
      </Button>
      <input
        ref={fileRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
          e.target.value = '';
        }}
      />
      {IMAGE_RE.test(url) && <img className="file-preview" src={url} alt="" />}
      {error && (
        <Typography.Text type="danger" className="field-error">
          {error}
        </Typography.Text>
      )}
    </span>
  );
}

export function ValueEditor({ type, value, options, onChange }: Props) {
  switch (type) {
    case 'boolean':
      return <Checkbox checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
    case 'null':
      return <Typography.Text type="secondary" italic>null</Typography.Text>;
    case 'number':
      return (
        <InputNumber
          size="small"
          className="value-input"
          value={typeof value === 'number' ? value : 0}
          onChange={(n) => onChange(typeof n === 'number' ? n : 0)}
        />
      );
    case 'longtext':
      return (
        <Input.TextArea
          className="value-textarea"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          autoSize={{ minRows: 2, maxRows: 8 }}
        />
      );
    case 'date':
      return (
        <DatePicker
          size="small"
          value={typeof value === 'string' && value ? dayjs(value) : null}
          onChange={(d) => onChange(d ? d.format('YYYY-MM-DD') : '')}
        />
      );
    case 'color':
      return (
        <ColorPicker
          size="small"
          showText
          value={typeof value === 'string' ? value : '#3b82f6'}
          onChange={(c) => onChange(c.toHexString())}
        />
      );
    case 'select':
      return (
        <Select
          size="small"
          className="value-input"
          value={typeof value === 'string' ? value : ''}
          options={(options ?? []).map((o) => ({ value: o, label: o }))}
          onChange={(v) => onChange(v)}
        />
      );
    case 'file':
      return <FileEditor value={value} onChange={onChange} />;
    case 'url':
      return (
        <Input
          size="small"
          className="value-input url"
          value={typeof value === 'string' ? value : ''}
          placeholder="https://…"
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <Input
          size="small"
          className="value-input"
          value={typeof value === 'string' ? value : String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
