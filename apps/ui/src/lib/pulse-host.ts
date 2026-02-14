export type PulseHostArg = string | number | boolean;

export const PULSE_TAB_RUNTIME_EVENT = "pulse:tab-runtime-updated";

export interface PulseHostBridge {
  send: (...args: PulseHostArg[]) => boolean;
  loadState?: () => string | null;
  saveState?: (serializedState: string) => boolean;
}

export interface PulseTabRuntimeEventDetail {
  tabId: string;
  url?: string;
  title?: string;
}

declare global {
  interface Window {
    __pulseHost?: PulseHostBridge;
  }
}

export function sendPulseHostCommand(...args: PulseHostArg[]) {
  if (typeof window === "undefined" || !window.__pulseHost) {
    return false;
  }

  try {
    return window.__pulseHost.send(...args);
  } catch {
    return false;
  }
}

export function loadPulseHostState(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const hostLoadState = window.__pulseHost?.loadState;
  if (typeof hostLoadState !== "function") {
    return null;
  }

  try {
    const loaded = hostLoadState();
    return typeof loaded === "string" ? loaded : null;
  } catch {
    return null;
  }
}

export function savePulseHostState(serializedState: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const hostSaveState = window.__pulseHost?.saveState;
  if (typeof hostSaveState !== "function") {
    return false;
  }

  try {
    return hostSaveState(serializedState);
  } catch {
    return false;
  }
}

export function parsePulseTabRuntimeEventDetail(
  value: unknown,
): PulseTabRuntimeEventDetail | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.tabId !== "string" || candidate.tabId.trim().length === 0) {
    return null;
  }

  const detail: PulseTabRuntimeEventDetail = {
    tabId: candidate.tabId,
  };

  if (typeof candidate.url === "string" && candidate.url.trim().length > 0) {
    detail.url = candidate.url;
  }
  if (typeof candidate.title === "string" && candidate.title.trim().length > 0) {
    detail.title = candidate.title;
  }

  return detail;
}
