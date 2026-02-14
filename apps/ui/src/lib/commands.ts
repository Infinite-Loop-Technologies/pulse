export type CommandId =
  | "workspace.new-group"
  | "workspace.new-tab"
  | "workspace.close-current-tab"
  | "workspace.focus-address"
  | "browser.back"
  | "browser.forward"
  | "browser.reload"
  | "browser.stop"
  | "ui.toggle-theme"
  | "ui.open-settings";

export type CommandCapability =
  | "workspace.mutate"
  | "workspace.navigate"
  | "browser.navigate"
  | "ui.settings";

export interface CommandDefinition {
  id: CommandId;
  label: string;
  description: string;
  category: "Workspace" | "Browser" | "Interface";
  capability: CommandCapability;
  defaultShortcuts: string[];
}

export const COMMAND_DEFINITIONS: CommandDefinition[] = [
  {
    id: "workspace.new-group",
    label: "New Group",
    description: "Create a new root group in the sidebar tree.",
    category: "Workspace",
    capability: "workspace.mutate",
    defaultShortcuts: ["Ctrl+Shift+G"],
  },
  {
    id: "workspace.new-tab",
    label: "New Tab",
    description: "Create a browser tab in the active group context.",
    category: "Workspace",
    capability: "workspace.mutate",
    defaultShortcuts: ["Ctrl+T"],
  },
  {
    id: "workspace.close-current-tab",
    label: "Close Current Tab",
    description: "Close the currently selected browser tab.",
    category: "Workspace",
    capability: "workspace.mutate",
    defaultShortcuts: ["Ctrl+W"],
  },
  {
    id: "workspace.focus-address",
    label: "Focus Address Bar",
    description: "Move focus to the omnibox and select its text.",
    category: "Workspace",
    capability: "workspace.navigate",
    defaultShortcuts: ["Ctrl+L"],
  },
  {
    id: "browser.back",
    label: "Back",
    description: "Navigate the current tab one page back.",
    category: "Browser",
    capability: "browser.navigate",
    defaultShortcuts: ["Alt+Left"],
  },
  {
    id: "browser.forward",
    label: "Forward",
    description: "Navigate the current tab one page forward.",
    category: "Browser",
    capability: "browser.navigate",
    defaultShortcuts: ["Alt+Right"],
  },
  {
    id: "browser.reload",
    label: "Reload",
    description: "Reload the current tab.",
    category: "Browser",
    capability: "browser.navigate",
    defaultShortcuts: ["Ctrl+R", "F5"],
  },
  {
    id: "browser.stop",
    label: "Stop Loading",
    description: "Stop loading the current tab.",
    category: "Browser",
    capability: "browser.navigate",
    defaultShortcuts: ["Escape"],
  },
  {
    id: "ui.toggle-theme",
    label: "Toggle Theme",
    description: "Switch between dark and light appearance.",
    category: "Interface",
    capability: "ui.settings",
    defaultShortcuts: ["Ctrl+Shift+L"],
  },
  {
    id: "ui.open-settings",
    label: "Open Settings",
    description: "Open the Pulse settings dialog.",
    category: "Interface",
    capability: "ui.settings",
    defaultShortcuts: ["Ctrl+Comma"],
  },
];

export const COMMAND_MAP = Object.fromEntries(
  COMMAND_DEFINITIONS.map((definition) => [definition.id, definition]),
) as Record<CommandId, CommandDefinition>;

export type ShortcutMap = Record<CommandId, string[]>;

export function defaultShortcutMap(): ShortcutMap {
  return Object.fromEntries(
    COMMAND_DEFINITIONS.map((definition) => [definition.id, [...definition.defaultShortcuts]]),
  ) as ShortcutMap;
}

export function resolveCommandFromKeyboardEvent(
  event: KeyboardEvent,
  shortcutMap: ShortcutMap,
): CommandId | null {
  const shortcut = keyboardEventToShortcut(event);
  if (!shortcut) {
    return null;
  }

  for (const definition of COMMAND_DEFINITIONS) {
    const bindings = shortcutMap[definition.id] ?? definition.defaultShortcuts;
    if (bindings.some((binding) => normalizeShortcut(binding) === shortcut)) {
      return definition.id;
    }
  }

  return null;
}

export function keyboardEventToShortcut(event: KeyboardEvent): string | null {
  const key = normalizedKey(event.key);
  if (!key) {
    return null;
  }

  const parts: string[] = [];
  if (event.ctrlKey) {
    parts.push("Ctrl");
  }
  if (event.metaKey) {
    parts.push("Meta");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  parts.push(key);
  return parts.join("+");
}

export function normalizeShortcut(shortcut: string): string {
  const rawParts = shortcut
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const modifiers = new Set<string>();
  let key: string | null = null;

  for (const part of rawParts) {
    const normalizedPart = part.toLowerCase();
    if (normalizedPart === "ctrl" || normalizedPart === "control") {
      modifiers.add("Ctrl");
      continue;
    }
    if (normalizedPart === "meta" || normalizedPart === "cmd" || normalizedPart === "command") {
      modifiers.add("Meta");
      continue;
    }
    if (normalizedPart === "alt" || normalizedPart === "option") {
      modifiers.add("Alt");
      continue;
    }
    if (normalizedPart === "shift") {
      modifiers.add("Shift");
      continue;
    }
    key = normalizedKey(part);
  }

  if (!key) {
    return "";
  }

  const ordered: string[] = [];
  if (modifiers.has("Ctrl")) {
    ordered.push("Ctrl");
  }
  if (modifiers.has("Meta")) {
    ordered.push("Meta");
  }
  if (modifiers.has("Alt")) {
    ordered.push("Alt");
  }
  if (modifiers.has("Shift")) {
    ordered.push("Shift");
  }
  ordered.push(key);
  return ordered.join("+");
}

function normalizedKey(raw: string): string | null {
  const key = raw.trim();
  if (!key) {
    return null;
  }

  const lower = key.toLowerCase();
  switch (lower) {
    case "control":
    case "shift":
    case "alt":
    case "meta":
      return null;
    case "arrowleft":
      return "Left";
    case "arrowright":
      return "Right";
    case "arrowup":
      return "Up";
    case "arrowdown":
      return "Down";
    case "esc":
      return "Escape";
    case " ":
    case "space":
      return "Space";
    case ",":
      return "Comma";
    default:
      break;
  }

  if (/^f\d{1,2}$/i.test(key)) {
    return key.toUpperCase();
  }

  if (key.length === 1) {
    return key.toUpperCase();
  }

  return key[0].toUpperCase() + key.slice(1);
}

export function isEditableElement(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }

  const tagName = element.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  return element.isContentEditable;
}
