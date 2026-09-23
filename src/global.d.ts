export {};

declare global {
  interface Window {
    jsonEditor: {
      getUploadConfig(): Promise<{ provider: 'cos' | 'local'; label: string }>;
      uploadFile(file: {
        name: string;
        mimeType: string;
        data: ArrayBuffer;
      }): Promise<string>;
    };
  }
}
