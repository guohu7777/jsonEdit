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
      // A JSON document may legitimately have a null root: distinguish absent
      // from explicit null so it survives a save/restart cycle.
      data: 'data' in parsed ? (parsed.data as JsonValue) : {},
      schema: parsed.schema ?? {},
      previewTab: parsed.previewTab === 'schema' ? 'schema' : 'json',
    };
  } catch {
    return null; // corrupted payload or unavailable storage -> start fresh
  }
}

export function saveWorkspace(ws: Workspace): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
    return true;
  } catch {
    return false; // quota exceeded or storage blocked
  }
}
