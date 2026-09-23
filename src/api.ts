export interface UploadConfig {
  provider: 'cos' | 'local';
  label: string;
}

export async function fetchUploadConfig(): Promise<UploadConfig> {
  return window.jsonEditor.getUploadConfig();
}

export async function uploadFile(file: File): Promise<string> {
  const data = await file.arrayBuffer();
  return window.jsonEditor.uploadFile({
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    data,
  });
}
