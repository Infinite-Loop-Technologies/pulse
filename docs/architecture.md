# Architecture (Prototype-First)

## Core Principle

Pulse does not hardcode "tab" or "file" as privileged concepts. It models:

- `Item`: durable identity + metadata + relationships
- `View`: a renderer/editor for an item type
- `Capability`: explicit permissions required by a view/runtime

## Runtime Split

- Rust host (`apps/shell`)
  - Process lifecycle, CEF integration, capability enforcement boundary
  - Minimal API surface exposed to UI
  - Future: secure capsule runtime and policy store
- React UI (`apps/ui`)
  - Sidebar tree, omnibox, workspace rendering
  - Orchestrates item/view state
  - Calls host APIs for privileged operations

## CEF View Composition (Current Prototype)

- One top-level CEF window contains:
  - One UI browser view (React shell) spanning the full client area.
  - Zero or more native content browser views (one per logical tab id), layered in the content panel region.
- Runtime style is forced to `ALLOY` for multi-view composition compatibility.
- UI and content are separate security contexts:
  - UI context gets a tiny host bridge (`window.__pulseHost.send(...)`).
  - Content context gets no Pulse bridge.
- UI sends host commands over CEF process messages:
  - `ensure-tab <tabId> <url>`
  - `activate-tab <tabId>`
  - `navigate-tab <tabId> <url>`
  - `close-tab <tabId>`
  - `set-content-bounds <x> <y> <width> <height>`
  - `set-content-visible <true|false>`
- UI reads/writes persisted workspace/session snapshots through trusted bridge helpers:
  - `window.__pulseHost.loadState()`
  - `window.__pulseHost.saveState(serializedState)`
- Host validates sender identity/origin before executing commands and applies layout/navigation on native content views.
- Host emits `pulse:tab-runtime-updated` events into the UI context so omnibox/tab metadata stays in sync with actual web navigation (redirects, in-page clicks, title changes).

## Persistence Layer (Current)

- Host-managed storage in `%LOCALAPPDATA%/Pulse/state`
- Versioned state envelope (`schema_version`) with migration hook support
- Crash-safe temp-file commit + primary/backup rotation
- Backup fallback and automatic recovery when primary is unreadable

## Why This Split

- Keep host small and security-focused
- Keep UX iteration speed high in web stack
- Allow multiple view runtimes later (browser view, code view, AI view, etc.)

## Future Capsule Model (Planned)

Each capsule declares:

- `provides`: commands, panels, tools, views
- `requires`: capabilities
- `sandbox`: runtime constraints (network/filesystem/process/mcp)

Host validates declarations, prompts user for grants, and issues scoped tokens for runtime calls.
