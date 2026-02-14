# Pulse Architecture

## Scope (Current Prototype)

Pulse is a two-context CEF application:

- A trusted UI context (React/Vite shell).
- Native web-content contexts (one CEF browser instance per logical tab).

The trusted UI renders the layout (sidebar, omnibox, settings, command UI). The host owns privileged operations and browser lifecycle.

## Runtime Components

## 1) Host (`apps/shell`, Rust + `cef-rs`)

- Bootstraps CEF.
- Owns the top-level window and native content tab overlays.
- Validates origin/browser identity before accepting UI commands.
- Persists workspace/session snapshots via crash-safe file writes.
- Emits runtime tab updates (`url`, `title`) back into the trusted UI context.

## 2) UI (`apps/ui`, React)

- Maintains workspace tree state and selection.
- Sends explicit commands to host through `window.__pulseHost`.
- Handles user interactions: drag/drop, context menus, keyboard commands, settings.
- Applies host runtime events to keep UI metadata aligned with real browser navigation.

## 3) Shared Domain (`crates/pulse-core`)

- Core type vocabulary for item kinds/capabilities.

## Invariants

1. Host command execution is deny-by-default unless request comes from trusted UI origin and expected UI browser instance.
2. Content browser contexts receive no direct privileged bridge.
3. Every logical browser tab id maps to at most one native content browser view.
4. UI tree order is represented by `(parentId, order)` and must remain deterministic after mutations.
5. Persisted state writes are atomic at file level:
   - write temp
   - fsync temp
   - rotate primary -> backup
   - rename temp -> primary
6. Backup is valid recovery source when primary is unreadable.

## Event Flow

## A) UI -> Host Command Flow

1. UI calls `window.__pulseHost.send(command, ...args)`.
2. Renderer sends CEF process message to browser process.
3. Host handler validates source process + trusted frame/origin + expected UI browser.
4. Host mutates `ShellState` and/or browser instances.

Examples:

- `ensure-tab`, `activate-tab`, `navigate-tab`, `close-tab`
- `browser-back`, `browser-forward`, `browser-reload`, `browser-stop`
- `set-content-bounds`, `set-content-visible`

## B) Host -> UI Runtime Flow

1. Host observes content-tab changes (`on_address_change`, `on_title_change`).
2. Host dispatches `window.dispatchEvent(new CustomEvent("pulse:tab-runtime-updated", ...))` into UI main frame.
3. UI updates tab URL/title and active omnibox value.

## C) Persistence Flow

1. UI serializes session snapshot.
2. UI calls host `saveState(serialized)`.
3. Host persists state envelope (`schema_version`, timestamp, payload) with backup rotation.
4. On startup, UI loads from host `loadState()` (fallback local session state if unavailable).

## Command + Capability Model (Prototype)

UI commands are defined in `apps/ui/src/lib/commands.ts` with:

- Stable command id.
- Human label/description/category.
- Required capability tag.
- Default keyboard shortcuts.

Current capability set is static-granted in the prototype UI, but command routing is explicitly capability-gated to prevent conceptual drift when real policy enforcement arrives.

## Security Boundary

- Trusted bridge APIs exist only on trusted UI origin.
- Content pages cannot call host bridge APIs.
- Host performs final command authorization.

## Known Limits

- Shortcuts are currently handled in UI context (not host-global).
- Capability grants are static in prototype (not user-granted/revocable yet).
- Sidebar tree currently supports root groups with one visible child depth in UI rendering.
