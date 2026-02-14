export type WorkspaceItemKind = "group" | "browser-tab" | "file-ref";

interface WorkspaceBase {
  id: string;
  kind: WorkspaceItemKind;
  parentId: string | null;
  order: number;
  title: string;
}

export interface WorkspaceGroup extends WorkspaceBase {
  kind: "group";
  collapsed: boolean;
}

export interface BrowserTabItem extends WorkspaceBase {
  kind: "browser-tab";
  url: string;
}

export interface FileRefItem extends WorkspaceBase {
  kind: "file-ref";
  filePath: string;
}

export type WorkspaceItem = WorkspaceGroup | BrowserTabItem | FileRefItem;

export const initialWorkspace: WorkspaceItem[] = [
  {
    id: "group-research",
    kind: "group",
    parentId: null,
    order: 0,
    title: "Research",
    collapsed: false,
  },
  {
    id: "tab-edge",
    kind: "browser-tab",
    parentId: "group-research",
    order: 0,
    title: "Microsoft Edge",
    url: "https://www.microsoft.com/edge",
  },
  {
    id: "tab-cef",
    kind: "browser-tab",
    parentId: "group-research",
    order: 1,
    title: "CEF-RS",
    url: "https://github.com/tauri-apps/cef-rs",
  },
  {
    id: "group-project",
    kind: "group",
    parentId: null,
    order: 1,
    title: "Project",
    collapsed: false,
  },
  {
    id: "file-readme",
    kind: "file-ref",
    parentId: "group-project",
    order: 0,
    title: "README.md",
    filePath: "README.md",
  },
  {
    id: "tab-shadcn",
    kind: "browser-tab",
    parentId: "group-project",
    order: 1,
    title: "shadcn Registry",
    url: "https://ui.shadcn.com/docs/registry/getting-started",
  },
];

export function sortByOrder(a: WorkspaceItem, b: WorkspaceItem) {
  return a.order - b.order;
}

export function childrenOf(items: WorkspaceItem[], parentId: string | null) {
  return items.filter((item) => item.parentId === parentId).sort(sortByOrder);
}

export function nextOrder(items: WorkspaceItem[], parentId: string | null) {
  const siblings = items.filter((item) => item.parentId === parentId);
  if (siblings.length === 0) {
    return 0;
  }

  return Math.max(...siblings.map((item) => item.order)) + 1;
}

export function toggleGroupCollapsed(items: WorkspaceItem[], groupId: string) {
  return items.map((item) => {
    if (item.id !== groupId || item.kind !== "group") {
      return item;
    }

    return {
      ...item,
      collapsed: !item.collapsed,
    };
  });
}

export function updateTabUrl(items: WorkspaceItem[], id: string, url: string) {
  return items.map((item) => {
    if (item.id !== id || item.kind !== "browser-tab") {
      return item;
    }

    return {
      ...item,
      url,
      title: titleFromUrl(url),
    };
  });
}

export function applyTabRuntimeUpdate(
  items: WorkspaceItem[],
  id: string,
  update: { url?: string; title?: string },
) {
  const nextUrl = typeof update.url === "string" ? update.url.trim() : "";
  const nextTitle = typeof update.title === "string" ? update.title.trim() : "";

  return items.map((item) => {
    if (item.id !== id || item.kind !== "browser-tab") {
      return item;
    }

    return {
      ...item,
      url: nextUrl.length > 0 ? nextUrl : item.url,
      title: nextTitle.length > 0 ? nextTitle : item.title,
    };
  });
}

export function addGroup(items: WorkspaceItem[], title = "New Group") {
  const newGroup: WorkspaceGroup = {
    id: crypto.randomUUID(),
    kind: "group",
    parentId: null,
    order: nextOrder(items, null),
    title,
    collapsed: false,
  };

  return [...items, newGroup];
}

export function addBrowserTab(
  items: WorkspaceItem[],
  parentId: string | null,
  url: string,
): { items: WorkspaceItem[]; newId: string } {
  const normalized = normalizeUrl(url);
  const newId = crypto.randomUUID();
  const newTab: BrowserTabItem = {
    id: newId,
    kind: "browser-tab",
    parentId,
    order: nextOrder(items, parentId),
    title: titleFromUrl(normalized),
    url: normalized,
  };

  return {
    items: [...items, newTab],
    newId,
  };
}

export function moveItem(
  items: WorkspaceItem[],
  id: string,
  direction: "up" | "down",
) {
  const target = items.find((item) => item.id === id);
  if (!target) {
    return items;
  }

  const siblings = items.filter((item) => item.parentId === target.parentId).sort(sortByOrder);
  const index = siblings.findIndex((item) => item.id === id);
  const swapIndex = direction === "up" ? index - 1 : index + 1;

  if (index < 0 || swapIndex < 0 || swapIndex >= siblings.length) {
    return items;
  }

  const current = siblings[index];
  const other = siblings[swapIndex];

  return items.map((item) => {
    if (item.id === current.id) {
      return { ...item, order: other.order };
    }
    if (item.id === other.id) {
      return { ...item, order: current.order };
    }
    return item;
  });
}

export function removeWorkspaceItem(items: WorkspaceItem[], itemId: string) {
  if (!items.some((item) => item.id === itemId)) {
    return items;
  }

  const removedIds = new Set<string>([itemId]);

  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (item.parentId && removedIds.has(item.parentId) && !removedIds.has(item.id)) {
        removedIds.add(item.id);
        changed = true;
      }
    }
  }

  const filtered = items.filter((item) => !removedIds.has(item.id));
  return reindexAllParents(filtered);
}

export function moveItemByDrop(items: WorkspaceItem[], activeId: string, overId: string) {
  if (activeId === overId) {
    return items;
  }

  const active = items.find((item) => item.id === activeId);
  const over = items.find((item) => item.id === overId);
  if (!active || !over) {
    return items;
  }

  if (active.kind === "group") {
    return moveGroupByDrop(items, active, over);
  }

  return moveChildByDrop(items, active, over);
}

function moveGroupByDrop(items: WorkspaceItem[], active: WorkspaceGroup, over: WorkspaceItem) {
  const targetGroupId = over.kind === "group" ? over.id : over.parentId;
  if (!targetGroupId || targetGroupId === active.id) {
    return items;
  }

  const rootGroups = childrenOf(items, null).filter(
    (item): item is WorkspaceGroup => item.kind === "group",
  );
  const remaining = rootGroups.filter((group) => group.id !== active.id);
  let targetIndex = remaining.findIndex((group) => group.id === targetGroupId);
  if (targetIndex < 0) {
    targetIndex = remaining.length;
  }

  const nextRootGroups = [...remaining];
  nextRootGroups.splice(targetIndex, 0, active);

  const nextOrder = new Map<string, number>();
  for (let index = 0; index < nextRootGroups.length; index += 1) {
    nextOrder.set(nextRootGroups[index].id, index);
  }

  return items.map((item) => {
    if (item.kind !== "group" || item.parentId !== null) {
      return item;
    }

    const order = nextOrder.get(item.id);
    if (order === undefined || order === item.order) {
      return item;
    }

    return { ...item, order };
  });
}

function moveChildByDrop(
  items: WorkspaceItem[],
  active: Exclude<WorkspaceItem, WorkspaceGroup>,
  over: WorkspaceItem,
) {
  const targetParentId = over.kind === "group" ? over.id : over.parentId;
  if (!targetParentId) {
    return items;
  }

  const sourceParentId = active.parentId;
  const nextItems = items.map((item) =>
    item.id === active.id ? { ...item, parentId: targetParentId } : item,
  );

  if (sourceParentId === targetParentId) {
    const orderedSiblings = reorderSiblingIds(nextItems, targetParentId, active.id, over);
    const orderMap = buildOrderMap(orderedSiblings);
    return nextItems.map((item) => {
      if (item.parentId !== targetParentId) {
        return item;
      }

      const nextOrder = orderMap.get(item.id);
      if (nextOrder === undefined || nextOrder === item.order) {
        return item;
      }

      return { ...item, order: nextOrder };
    });
  }

  const sourceSiblings = childrenOf(nextItems, sourceParentId).filter((item) => item.id !== active.id);
  const targetSiblings = reorderSiblingIds(nextItems, targetParentId, active.id, over)
    .map((id) => nextItems.find((item) => item.id === id))
    .filter((item): item is WorkspaceItem => Boolean(item));

  const sourceOrderMap = buildOrderMap(sourceSiblings.map((item) => item.id));
  const targetOrderMap = buildOrderMap(targetSiblings.map((item) => item.id));

  return nextItems.map((item) => {
    if (item.parentId === sourceParentId) {
      const nextOrder = sourceOrderMap.get(item.id);
      if (nextOrder !== undefined) {
        return { ...item, order: nextOrder };
      }
    }

    if (item.parentId === targetParentId) {
      const nextOrder = targetOrderMap.get(item.id);
      if (nextOrder !== undefined) {
        return { ...item, order: nextOrder };
      }
    }

    return item;
  });
}

function reorderSiblingIds(
  items: WorkspaceItem[],
  parentId: string | null,
  activeId: string,
  over: WorkspaceItem,
) {
  const siblings = childrenOf(items, parentId).filter((item) => item.id !== activeId);
  const siblingIds = siblings.map((item) => item.id);

  let insertIndex = siblingIds.length;
  if (over.kind !== "group" && over.parentId === parentId) {
    const overIndex = siblingIds.indexOf(over.id);
    if (overIndex >= 0) {
      insertIndex = overIndex;
    }
  }

  const nextIds = [...siblingIds];
  nextIds.splice(clamp(insertIndex, 0, nextIds.length), 0, activeId);
  return nextIds;
}

function buildOrderMap(ids: string[]) {
  const map = new Map<string, number>();
  for (let index = 0; index < ids.length; index += 1) {
    map.set(ids[index], index);
  }
  return map;
}

function reindexAllParents(items: WorkspaceItem[]) {
  const parentKeys = new Set<string>();
  for (const item of items) {
    parentKeys.add(item.parentId ?? "__root__");
  }

  let nextItems = [...items];
  for (const key of parentKeys) {
    const parentId = key === "__root__" ? null : key;
    const siblings = childrenOf(nextItems, parentId);
    const siblingOrder = new Map<string, number>();
    for (let index = 0; index < siblings.length; index += 1) {
      siblingOrder.set(siblings[index].id, index);
    }

    nextItems = nextItems.map((item) => {
      if (item.parentId !== parentId || !siblingOrder.has(item.id)) {
        return item;
      }
      const order = siblingOrder.get(item.id) ?? item.order;
      if (order === item.order) {
        return item;
      }
      return { ...item, order };
    });
  }

  return nextItems;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "https://duckduckgo.com";
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed);
  if (hasScheme) {
    return trimmed;
  }

  if (trimmed.includes(" ") || !trimmed.includes(".")) {
    return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
  }

  return `https://${trimmed}`;
}

export function titleFromUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname.replace("www.", "");
  } catch {
    return "New Tab";
  }
}
