import { useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  ColorInput,
  Image,
  Modal,
  NumberInput,
  Select,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconPlayerPlayFilled, IconUpload } from '@tabler/icons-react';
import type { FieldType, JsonValue } from '../types';
import { uploadFile } from '../api';

interface Props {
  type: FieldType;
  value: JsonValue;
  options?: string[];
  onChange: (value: JsonValue) => void;
  /** Declared media kind (e.g. resource type); when set it fully decides the preview kind. */
  mediaHint?: 'image' | 'video';
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#].*)?$/i;
const VIDEO_RE = /\.(mp4|webm|mov|mkv|avi|m4v|mpg|mpeg)(?:[?#].*)?$/i;

function FileEditor({
  value,
  onChange,
  mediaHint,
}: {
  value: JsonValue;
  onChange: (v: JsonValue) => void;
  mediaHint?: 'image' | 'video';
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const url = typeof value === 'string' ? value : '';
  const isVideo = mediaHint === 'video' || (mediaHint === undefined && VIDEO_RE.test(url));
  const isImage = mediaHint === 'image' || (mediaHint === undefined && IMAGE_RE.test(url));
  const hasPreview = (isImage || isVideo) && url;

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
      <TextInput
        size="xs"
        className="value-input url"
        value={url}
        placeholder="上传后自动填入 URL"
        onChange={(e) => onChange(e.target.value)}
      />
      <Button
        size="xs"
        leftSection={<IconUpload size={14} />}
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
      {isImage && url && (
        <Image
          src={url}
          alt=""
          className="file-preview-img"
          title="预览图片"
          onClick={() => setPreviewOpen(true)}
        />
      )}
      {isVideo && url && (
        <button
          type="button"
          className="video-thumb"
          title="预览视频"
          onClick={() => setPreviewOpen(true)}
        >
          <video className="file-preview" src={url} muted preload="metadata" />
          <IconPlayerPlayFilled size={22} className="video-thumb-badge" />
        </button>
      )}
      {hasPreview && (
        <Modal
          opened={previewOpen}
          onClose={() => setPreviewOpen(false)}
          centered
          padding="xs"
          size="fit-content"
          styles={{ content: { maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto' } }}
        >
          {isVideo ? (
            <video className="video-modal-player" src={url} controls autoPlay />
          ) : (
            <img className="img-preview-full" src={url} alt="" />
          )}
        </Modal>
      )}
      {error && (
        <Text c="red" size="xs" className="field-error" span>
          {error}
        </Text>
      )}
    </span>
  );
}

export function ValueEditor({ type, value, options, onChange, mediaHint }: Props) {
  switch (type) {
    case 'boolean':
      return (
        <Checkbox
          size="xs"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case 'null':
      return (
        <Text c="dimmed" fs="italic" size="xs" span>
          null
        </Text>
      );
    case 'number':
      return (
        <NumberInput
          size="xs"
          className="value-input"
          hideControls
          value={typeof value === 'number' ? value : 0}
          onChange={(n) => onChange(typeof n === 'number' ? n : Number(n) || 0)}
        />
      );
    case 'longtext':
      return (
        <Textarea
          size="xs"
          className="value-textarea"
          autosize
          minRows={2}
          maxRows={8}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'date':
      return (
        <DatePickerInput
          size="xs"
          className="value-input"
          locale="zh-cn"
          valueFormat="YYYY-MM-DD"
          clearable
          value={typeof value === 'string' && value ? value : null}
          onChange={(d) => onChange(d ?? '')}
        />
      );
    case 'color':
      return (
        <ColorInput
          size="xs"
          className="value-input"
          format="hex"
          fixOnBlur
          value={typeof value === 'string' ? value : '#14b8a6'}
          onChange={onChange}
        />
      );
    case 'select':
      return (
        <Select
          size="xs"
          className="value-input"
          value={typeof value === 'string' ? value : ''}
          data={options ?? []}
          allowDeselect={false}
          onChange={(v) => onChange(v ?? '')}
        />
      );
    case 'file':
      return <FileEditor value={value} onChange={onChange} mediaHint={mediaHint} />;
    case 'url':
      return (
        <TextInput
          size="xs"
          className="value-input url"
          value={typeof value === 'string' ? value : ''}
          placeholder="https://…"
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <TextInput
          size="xs"
          className="value-input"
          value={typeof value === 'string' ? value : String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
