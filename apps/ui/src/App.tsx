import { ArrowLeft, ArrowRight, Plus, RotateCcw, Search, Square } from "lucide-react";
import { type FormEvent, type RefObject, useEffect, useMemo, useRef, useState } from "react";

import { SettingsModal } from "@/components/settings-modal";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COMMAND_DEFINITIONS,
  COMMAND_MAP,
  defaultShortcutMap,
  isEditableElement,
  resolveCommandFromKeyboardEvent,
  type CommandId,
  type ShortcutMap,
} from "@/lib/commands";
import {
  PULSE_TAB_RUNTIME_EVENT,
  loadPulseHostState,
  parsePulseTabRuntimeEventDetail,
  savePulseHostState,
  sendPulseHostCommand,
} from "@/lib/pulse-host";
import {
  defaultUiSessionState,
  parseUiSessionState,
  serializeUiSessionState,
  type UiSessionState,
} from "@/lib/session-state";
import {
  type BrowserTabItem,
  type WorkspaceItem,
  addBrowserTab,
  addGroup,
  applyTabRuntimeUpdate,
  childrenOf,
  moveItemByDrop,
  normalizeUrl,
  removeWorkspaceItem,
  toggleGroupCollapsed,
  updateTabUrl,
} from "@/lib/workspace";
import { cn } from "@/lib/utils";

const LOCAL_SESSION_STORAGE_KEY = "pulse.ui.session.v1";
const THEME_STORAGE_KEY = "pulse.ui.theme";
const SHORTCUTS_STORAGE_KEY = "pulse.ui.shortcuts.v1";
const SAVE_DEBOUNCE_MS = 250;

const GRANTED_CAPABILITIES = new Set([
  "workspace.mutate",
  "workspace.navigate",
  "browser.navigate",
  "ui.settings",
]);

function readLocalSessionState(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(LOCAL_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLocalSessionState(serializedState: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(LOCAL_SESSION_STORAGE_KEY, serializedState);
  } catch {
    // Ignore storage write errors.
  }
}

function loadInitialSessionState(): UiSessionState {
  const hostSerialized = loadPulseHostState();
  if (hostSerialized) {
    const parsed = parseUiSessionState(hostSerialized);
    if (parsed) {
      return parsed;
    }
  }

  const localSerialized = readLocalSessionState();
  if (localSerialized) {
    const parsed = parseUiSessionState(localSerialized);
    if (parsed) {
      return parsed;
    }
  }

  return defaultUiSessionState();
}

function loadInitialDarkMode() {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light") {
      return false;
    }
    if (stored === "dark") {
      return true;
    }
  } catch {
    return true;
  }

  return true;
}

function loadShortcutMap() {
  const defaults = defaultShortcutMap();
  if (typeof window === "undefined") {
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const merged: ShortcutMap = { ...defaults };

    for (const definition of COMMAND_DEFINITIONS) {
      const candidate = parsed[definition.id];
      if (Array.isArray(candidate)) {
        const normalized = candidate.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
        );
        if (normalized.length > 0) {
          merged[definition.id] = normalized;
        }
      }
    }

    return merged;
  } catch {
    return defaults;
  }
}

function reportContentBounds(contentSlot: HTMLDivElement) {
  const rect = contentSlot.getBoundingClientRect();
  sendPulseHostCommand(
    "set-content-bounds",
    Math.round(rect.left),
    Math.round(rect.top),
    Math.max(1, Math.round(rect.width)),
    Math.max(1, Math.round(rect.height)),
  );
}

function resolveNextSelectionAfterTabClose(items: WorkspaceItem[], closedTab: BrowserTabItem) {
  const siblingTab = childrenOf(items, closedTab.parentId).find(
    (item): item is BrowserTabItem => item.kind === "browser-tab",
  );
  if (siblingTab) {
    return siblingTab.id;
  }

  const anyTab = items.find((item): item is BrowserTabItem => item.kind === "browser-tab");
  if (anyTab) {
    return anyTab.id;
  }

  const parent = closedTab.parentId ? items.find((item) => item.id === closedTab.parentId) : null;
  if (parent) {
    return parent.id;
  }

  return items[0]?.id ?? "";
}

const initialSessionState = loadInitialSessionState();

function App() {
  const [items, setItems] = useState<WorkspaceItem[]>(initialSessionState.items);
  const [selectedItemId, setSelectedItemId] = useState<string>(initialSessionState.selectedItemId);
  const [address, setAddress] = useState<string>(initialSessionState.address);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(loadInitialDarkMode);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutMap] = useState<ShortcutMap>(loadShortcutMap);

  const contentViewportRef = useRef<HTMLDivElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const runCommandRef = useRef<(commandId: CommandId) => void>(() => {});

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );
  const selectedTab = selectedItem?.kind === "browser-tab" ? selectedItem : null;
  const selectedTabId = selectedTab?.id ?? null;
  const selectedTabUrl = selectedTab?.url ?? null;
  const rootGroups = useMemo(() => childrenOf(items, null), [items]);
  const defaultParentId = rootGroups[0]?.id ?? null;

  useEffect(() => {
    if (selectedTabId && selectedTabUrl) {
      sendPulseHostCommand("ensure-tab", selectedTabId, selectedTabUrl);
      sendPulseHostCommand("activate-tab", selectedTabId);
    }
  }, [selectedTabId, selectedTabUrl]);

  useEffect(() => {
    if (!selectedTabId) {
      sendPulseHostCommand("set-content-visible", false);
      return;
    }

    sendPulseHostCommand("set-content-visible", !settingsOpen);
  }, [selectedTabId, settingsOpen]);

  useEffect(() => {
    if (!selectedTabId) {
      return;
    }

    const contentSlot = contentViewportRef.current;
    if (!contentSlot) {
      return;
    }

    const report = () => reportContentBounds(contentSlot);
    report();

    const observer = new ResizeObserver(report);
    observer.observe(contentSlot);
    window.addEventListener("resize", report);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", report);
    };
  }, [selectedTabId]);

  useEffect(() => {
    const serialized = serializeUiSessionState({
      items,
      selectedItemId,
      address,
    });

    const timeoutId = window.setTimeout(() => {
      const savedToHost = savePulseHostState(serialized);
      if (!savedToHost) {
        writeLocalSessionState(serialized);
        return;
      }

      writeLocalSessionState(serialized);
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [items, selectedItemId, address]);

  useEffect(() => {
    const rootElement = document.documentElement;
    rootElement.classList.toggle("dark", isDarkMode);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? "dark" : "light");
    } catch {
      // Ignore storage write errors.
    }
  }, [isDarkMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(shortcutMap));
    } catch {
      // Ignore storage write errors.
    }
  }, [shortcutMap]);

  useEffect(() => {
    const listener: EventListener = (event) => {
      const detail = parsePulseTabRuntimeEventDetail((event as CustomEvent<unknown>).detail);
      if (!detail) {
        return;
      }

      setItems((prev) => applyTabRuntimeUpdate(prev, detail.tabId, detail));
      if (selectedTabId === detail.tabId && detail.url) {
        setAddress(detail.url);
      }
    };

    window.addEventListener(PULSE_TAB_RUNTIME_EVENT, listener);
    return () => window.removeEventListener(PULSE_TAB_RUNTIME_EVENT, listener);
  }, [selectedTabId]);

  function onSelect(item: WorkspaceItem) {
    setSelectedItemId(item.id);
    if (item.kind === "browser-tab") {
      setAddress(item.url);
      sendPulseHostCommand("activate-tab", item.id);
    }
  }

  function onToggleGroup(id: string) {
    setItems((prev) => toggleGroupCollapsed(prev, id));
  }

  function onAddGroup() {
    setItems((prev) => addGroup(prev));
  }

  function onAddTab(parentId: string | null = defaultParentId) {
    setItems((prev) => {
      const result = addBrowserTab(prev, parentId, "https://duckduckgo.com");
      setSelectedItemId(result.newId);
      setAddress("https://duckduckgo.com");
      sendPulseHostCommand("ensure-tab", result.newId, "https://duckduckgo.com");
      sendPulseHostCommand("activate-tab", result.newId);
      return result.items;
    });
  }

  function onCloseTab(id: string) {
    const tab = items.find((item): item is BrowserTabItem => item.id === id && item.kind === "browser-tab");
    if (!tab) {
      return;
    }

    const nextItems = removeWorkspaceItem(items, id);
    setItems(nextItems);
    sendPulseHostCommand("close-tab", id);

    if (selectedItemId !== id) {
      return;
    }

    const nextSelection = resolveNextSelectionAfterTabClose(nextItems, tab);
    setSelectedItemId(nextSelection);

    const nextSelectedTab = nextItems.find(
      (item): item is BrowserTabItem => item.id === nextSelection && item.kind === "browser-tab",
    );
    if (nextSelectedTab) {
      setAddress(nextSelectedTab.url);
      return;
    }

    setAddress("");
  }

  function onNavigate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetUrl = normalizeUrl(address);
    setAddress(targetUrl);

    if (selectedTab) {
      setItems((prev) => updateTabUrl(prev, selectedTab.id, targetUrl));
      sendPulseHostCommand("navigate-tab", selectedTab.id, targetUrl);
      return;
    }

    setItems((prev) => {
      const result = addBrowserTab(prev, defaultParentId, targetUrl);
      setSelectedItemId(result.newId);
      sendPulseHostCommand("ensure-tab", result.newId, targetUrl);
      sendPulseHostCommand("activate-tab", result.newId);
      return result.items;
    });
  }

  function onMoveByDrop(activeId: string, overId: string) {
    setItems((prev) => moveItemByDrop(prev, activeId, overId));
  }

  function executeBrowserControl(action: "browser-back" | "browser-forward" | "browser-reload" | "browser-stop") {
    if (!selectedTabId) {
      return;
    }

    sendPulseHostCommand(action, selectedTabId);
  }

  function focusAddressBar() {
    const input = addressInputRef.current;
    if (!input) {
      return;
    }

    input.focus();
    input.select();
  }

  function runCommand(commandId: CommandId) {
    const command = COMMAND_MAP[commandId];
    if (!command || !GRANTED_CAPABILITIES.has(command.capability)) {
      return;
    }

    switch (commandId) {
      case "workspace.new-group":
        onAddGroup();
        return;
      case "workspace.new-tab":
        onAddTab();
        return;
      case "workspace.close-current-tab":
        if (selectedTabId) {
          onCloseTab(selectedTabId);
        }
        return;
      case "workspace.focus-address":
        focusAddressBar();
        return;
      case "browser.back":
        executeBrowserControl("browser-back");
        return;
      case "browser.forward":
        executeBrowserControl("browser-forward");
        return;
      case "browser.reload":
        executeBrowserControl("browser-reload");
        return;
      case "browser.stop":
        executeBrowserControl("browser-stop");
        return;
      case "ui.toggle-theme":
        setIsDarkMode((prev) => !prev);
        return;
      case "ui.open-settings":
        setSettingsOpen(true);
        return;
      default:
        return;
    }
  }

  useEffect(() => {
    runCommandRef.current = runCommand;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        return;
      }

      const commandId = resolveCommandFromKeyboardEvent(event, shortcutMap);
      if (!commandId) {
        return;
      }

      event.preventDefault();
      runCommandRef.current(commandId);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcutMap]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          isDarkMode
            ? "bg-[radial-gradient(circle_at_15%_20%,rgba(24,183,162,0.2),transparent_30%),radial-gradient(circle_at_83%_10%,rgba(76,144,255,0.2),transparent_34%),linear-gradient(180deg,rgba(8,12,20,0.88),rgba(13,18,31,0.95))]"
            : "bg-[radial-gradient(circle_at_18%_22%,rgba(30,150,130,0.2),transparent_28%),radial-gradient(circle_at_86%_14%,rgba(240,120,72,0.18),transparent_32%),linear-gradient(180deg,rgba(250,246,239,0.9),rgba(242,244,248,0.95))]",
        )}
      />
      <main className="relative mx-auto flex min-h-screen max-w-[1600px] animate-fade-slide-in flex-col">
        <div className="grid flex-1 grid-rows-[auto_1fr] overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-[0_24px_80px_-32px_rgba(5,7,16,0.92)] backdrop-blur md:grid-cols-[320px_1fr] md:grid-rows-1">
          <WorkspaceSidebar
            items={items}
            selectedItemId={selectedItemId || null}
            onSelect={onSelect}
            onToggleGroup={onToggleGroup}
            onAddGroup={onAddGroup}
            onAddTab={onAddTab}
            onMoveByDrop={onMoveByDrop}
            onCloseTab={onCloseTab}
            onOpenSettings={() => setSettingsOpen(true)}
            isDarkMode={isDarkMode}
            onToggleTheme={() => setIsDarkMode((prev) => !prev)}
          />

          <section className="grid min-h-[420px] grid-rows-[auto_1fr] bg-background/30">
            <header className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  title="Back"
                  onClick={() => runCommand("browser.back")}
                  disabled={!selectedTabId}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Forward"
                  onClick={() => runCommand("browser.forward")}
                  disabled={!selectedTabId}
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Reload"
                  onClick={() => runCommand("browser.reload")}
                  disabled={!selectedTabId}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Stop"
                  onClick={() => runCommand("browser.stop")}
                  disabled={!selectedTabId}
                >
                  <Square className="h-3.5 w-3.5" />
                </Button>
              </div>
              <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={onNavigate}>
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={addressInputRef}
                    className="pl-8"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="Enter URL or search..."
                  />
                </div>
                <Button type="submit" variant="default" size="sm">
                  Go
                </Button>
              </form>
              <Button variant="outline" size="sm" onClick={() => runCommand("workspace.new-tab")}>
                <Plus className="h-3.5 w-3.5" />
                New Tab
              </Button>
            </header>

            <WorkspaceCanvas selectedItem={selectedItem} contentViewportRef={contentViewportRef} />
          </section>
        </div>
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode((prev) => !prev)}
        shortcuts={shortcutMap}
        commands={COMMAND_DEFINITIONS}
      />
    </div>
  );
}

function WorkspaceCanvas({
  selectedItem,
  contentViewportRef,
}: {
  selectedItem: WorkspaceItem | null;
  contentViewportRef: RefObject<HTMLDivElement | null>;
}) {
  if (!selectedItem) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        Select a workspace item from the sidebar.
      </div>
    );
  }

  if (selectedItem.kind === "browser-tab") {
    return <BrowserSurface item={selectedItem} contentViewportRef={contentViewportRef} />;
  }

  if (selectedItem.kind === "file-ref") {
    return (
      <div className="h-full p-4">
        <div className="h-full rounded-xl border border-border/70 bg-card/70 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">File View (planned)</p>
          <p className="mt-2 text-lg font-semibold">{selectedItem.filePath}</p>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            File references are first-class items. Next milestones will render editor views, diff
            panels, and AI-generated tools with explicit host capabilities.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full p-4">
      <div className="h-full rounded-xl border border-border/70 bg-card/70 p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Group Overview</p>
        <p className="mt-2 text-lg font-semibold">{selectedItem.title}</p>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Group nodes organize mixed item types. This mirrors Pulse&apos;s direction where tabs,
          files, tools, and capsules share one tree model.
        </p>
      </div>
    </div>
  );
}

function BrowserSurface({
  item,
  contentViewportRef,
}: {
  item: BrowserTabItem;
  contentViewportRef: RefObject<HTMLDivElement | null>;
}) {
  const isHostBridgeAvailable =
    typeof window !== "undefined" && typeof window.__pulseHost?.send === "function";

  return (
    <div className="h-full p-3">
      <div className="h-full overflow-hidden rounded-xl border border-border/70 bg-background">
        <div className="flex h-8 items-center gap-1 border-b border-border/70 px-3 text-[11px] text-muted-foreground">
          <span className="inline-flex h-2 w-2 rounded-full bg-[#f46d6d]" />
          <span className="inline-flex h-2 w-2 rounded-full bg-[#f4bf4d]" />
          <span className="inline-flex h-2 w-2 rounded-full bg-[#57cc6f]" />
          <span className="ml-2 truncate font-mono">{item.url}</span>
        </div>
        <div className="relative h-[calc(100%-2rem)]">
          <div ref={contentViewportRef} className="h-full w-full bg-background/50" />
          {!isHostBridgeAvailable ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">
              <div>
                <p className="text-sm font-semibold text-foreground">CEF host bridge not detected</p>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                  Run this UI inside Pulse (`pnpm dev`) to render native CEF web content in this
                  panel.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default App;
