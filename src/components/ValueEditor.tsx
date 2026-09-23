import { useRef, useState } from 'react';
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
      <input
        className="value-input url"
        value={url}
        placeholder="上传后自动填入 URL"
        onChange={(e) => onChange(e.target.value)}
      />
      <button className="upload-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? '上传中…' : '上传文件'}
      </button>
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
      {error && <span className="field-error">{error}</span>}
    </span>
  );
}

export function ValueEditor({ type, value, options, onChange }: Props) {
  switch (type) {
    case 'boolean':
      return (
        <input
          className="value-checkbox"
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case 'null':
      return <span className="null-label">null</span>;
    case 'number':
      return (
        <input
          className="value-input"
          type="number"
          value={typeof value === 'number' ? value : 0}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
        />
      );
    case 'longtext':
      return (
        <textarea
          className="value-textarea"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      );
    case 'date':
      return (
        <input
          className="value-input"
          type="date"
          value={typeof value === 'string' ? value.slice(0, 10) : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'color':
      return (
        <span className="color-editor">
          <input
            type="color"
            value={typeof value === 'string' ? value : '#3b82f6'}
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            className="value-input narrow"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </span>
      );
    case 'select':
      return (
        <select
          className="value-input"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          {(options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case 'file':
      return <FileEditor value={value} onChange={onChange} />;
    case 'url':
      return (
        <input
          className="value-input url"
          type="url"
          value={typeof value === 'string' ? value : ''}
          placeholder="https://…"
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <input
          className="value-input"
          value={typeof value === 'string' ? value : String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
