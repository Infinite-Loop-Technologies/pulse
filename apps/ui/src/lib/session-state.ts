import {
  type BrowserTabItem,
  type WorkspaceItem,
  initialWorkspace,
  normalizeUrl,
} from "@/lib/workspace";

const CURRENT_SESSION_VERSION = 1 as const;
const DEFAULT_ADDRESS = "https://www.microsoft.com/edge";

export interface UiSessionState {
  items: WorkspaceItem[];
  selectedItemId: string;
  address: string;
}

interface PersistedUiSessionV1 {
  version: typeof CURRENT_SESSION_VERSION;
  items: unknown;
  selectedItemId: unknown;
  address: unknown;
}

interface PersistedUiSessionV0 {
  items: unknown;
  selectedItemId?: unknown;
  address?: unknown;
}

export function defaultUiSessionState(): UiSessionState {
  const items = cloneWorkspaceItems(initialWorkspace);
  const selectedItemId = pickSelectedItemId(items, null);
  return {
    items,
    selectedItemId,
    address: pickAddress(items, selectedItemId, null),
  };
}

export function parseUiSessionState(serialized: string): UiSessionState | null {
  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch {
    return null;
  }

  return sanitizeUiSessionState(raw);
}

export function serializeUiSessionState(state: UiSessionState): string {
  return JSON.stringify({
    version: CURRENT_SESSION_VERSION,
    items: state.items,
    selectedItemId: state.selectedItemId,
    address: state.address,
  });
}

function sanitizeUiSessionState(raw: unknown): UiSessionState | null {
  if (!isRecord(raw)) {
    return null;
  }

  const version =
    typeof raw.version === "number" ? raw.version : 0;
  if (version !== 0 && version !== CURRENT_SESSION_VERSION) {
    return null;
  }

  const legacy = raw as unknown as PersistedUiSessionV0;
  const v1 = raw as unknown as PersistedUiSessionV1;
  const items = parseWorkspaceItems(version === 0 ? legacy.items : v1.items);
  if (!items || items.length === 0) {
    return null;
  }

  const selectedItemId = pickSelectedItemId(
    items,
    version === 0 ? legacy.selectedItemId : v1.selectedItemId,
  );
  const address = pickAddress(
    items,
    selectedItemId,
    version === 0 ? legacy.address : v1.address,
  );

  return {
    items,
    selectedItemId,
    address,
  };
}

function parseWorkspaceItems(value: unknown): WorkspaceItem[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const parsed: WorkspaceItem[] = [];
  const seenIds = new Set<string>();

  for (const candidate of value) {
    const item = parseWorkspaceItem(candidate);
    if (!item) {
      continue;
    }
    if (seenIds.has(item.id)) {
      continue;
    }
    seenIds.add(item.id);
    parsed.push(item);
  }

  if (parsed.length === 0) {
    return null;
  }

  return parsed;
}

function parseWorkspaceItem(value: unknown): WorkspaceItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asNonEmptyString(value.id);
  const kind = asNonEmptyString(value.kind);
  const title = asNonEmptyString(value.title);
  const parentId = asNullableString(value.parentId);
  const order = asInteger(value.order);
  if (!id || !kind || !title || order === null) {
    return null;
  }

  if (kind === "group") {
    return {
      id,
      kind,
      title,
      parentId,
      order,
      collapsed: Boolean(value.collapsed),
    };
  }

  if (kind === "browser-tab") {
    const rawUrl = asNonEmptyString(value.url);
    if (!rawUrl) {
      return null;
    }
    return {
      id,
      kind,
      title,
      parentId,
      order,
      url: normalizeUrl(rawUrl),
    };
  }

  if (kind === "file-ref") {
    const filePath = asNonEmptyString(value.filePath);
    if (!filePath) {
      return null;
    }
    return {
      id,
      kind,
      title,
      parentId,
      order,
      filePath,
    };
  }

  return null;
}

function pickSelectedItemId(items: WorkspaceItem[], candidate: unknown): string {
  if (typeof candidate === "string" && items.some((item) => item.id === candidate)) {
    return candidate;
  }

  const browserTab = items.find((item) => item.kind === "browser-tab");
  if (browserTab) {
    return browserTab.id;
  }

  return items[0].id;
}

function pickAddress(
  items: WorkspaceItem[],
  selectedItemId: string,
  candidate: unknown,
): string {
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate;
  }

  const selected = items.find(
    (item): item is BrowserTabItem =>
      item.id === selectedItemId && item.kind === "browser-tab",
  );
  if (selected) {
    return selected.url;
  }

  const firstTab = items.find(
    (item): item is BrowserTabItem => item.kind === "browser-tab",
  );
  if (firstTab) {
    return firstTab.url;
  }

  return DEFAULT_ADDRESS;
}

function cloneWorkspaceItems(items: WorkspaceItem[]): WorkspaceItem[] {
  return items.map((item) => ({ ...item }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }

  return value;
}

function asInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.trunc(value);
}
