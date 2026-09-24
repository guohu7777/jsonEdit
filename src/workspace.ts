import type { JsonValue, SchemaNode } from './types';

/** Last editing session, restored on launch. */
export interface Workspace {
  data: JsonValue;
  schema: SchemaNode;
  previewTab: 'json' | 'schema';
}

const STORAGE_KEY = 'jsonEditor.workspace.v1';

export function loadWorkspace(): Workspace | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Workspace>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      data: parsed.data ?? {},
      schema: parsed.schema ?? {},
      previewTab: parsed.previewTab === 'schema' ? 'schema' : 'json',
    };
  } catch {
    return null; // corrupted payload or unavailable storage -> start fresh
  }
}

export function saveWorkspace(ws: Workspace): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
  } catch {
    // quota exceeded or storage blocked; persistence is best-effort
  }
}
