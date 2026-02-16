# Pulse

Pulse is an AI-powered creation and knowledge work engine that starts as a browser with a modern vertical-tab interface and evolves into a modular, capability-gated workspace.

## Current Prototype Scope

- Rust host built with `cef-rs` (CEF app shell baseline)
- React + Vite + Tailwind UI embedded as web content
- Sidebar-first browser shell with vertical tab tree
- Native in-window web content pane with per-tab native sessions (real CEF browser views, not iframes)
- UI-to-host IPC bridge for tab/session/layout commands
- Persistent workspace/session snapshots with schema versioning + backup recovery
- Monorepo structure prepared for incremental expansion

## Monorepo Layout

- `apps/shell`: Rust host process (CEF bootstrap, lifecycle, app shell)
- `apps/ui`: React/Vite interface (sidebar, tabs, omnibox, workspace canvas)
- `apps/site`: Next.js product website (Tailwind v4 + shadcn/ui)
- `crates/pulse-core`: shared domain model (items, views, capabilities)
- `docs`: architecture, roadmap, capabilities model
- `.github/workflows`: CI and release scaffolding

## Quick Start (Windows / PowerShell)

1. Ensure a compatible CEF bundle exists (prototype is pinned to CEF `143.0.10`):
   - `powershell -ExecutionPolicy Bypass -File scripts/setup-cef.ps1`
2. Ensure `CEF_PATH` points to your extracted CEF binaries:
   - Example: `$env:CEF_PATH="$env:USERPROFILE/.local/share/cef-pulse"`
3. Install JS dependencies:
   - `pnpm install`
4. Run UI + host together:
   - `pnpm dev`
5. Run product site locally (optional):
   - `pnpm dev:site`

The host launches CEF with:
- UI context: `http://localhost:5173` (`PULSE_UI_URL`)
- Content context: `https://www.microsoft.com/edge` (`PULSE_URL`, changeable via omnibox)

The shell launcher script auto-resolves `ninja.exe` from common Visual Studio installs for `cef-rs` builds.
The launcher also syncs CEF runtime files from `CEF_PATH` into `target/debug` before `cargo run` to avoid stale DLL/Pak mismatches.
On Windows, debug runs also avoid CEF auto de-elevation behavior that can otherwise produce a misleading `CEF initialize returned 0` in elevated terminals.

## Why Start Here

Pulse has a large end-state. This prototype intentionally ships a minimal browser shell first, while preserving an extensible domain model where browser tabs, files, tools, and future AI-generated surfaces are all represented as items + views + capabilities.

## Windowing Note

CEF has its own native windowing/views stack, and this prototype uses that path first for fastest bootstrap.
Tao integration is planned as a follow-up once browser lifecycle and item/view state are stable.

See:

- `docs/vision.md`
- `docs/architecture.md`
- `docs/capabilities.md`
- `docs/roadmap.md`
- `docs/deployment.md`
- `docs/persistence.md`
- `docs/decisions/0001-windowing-bootstrap.md`
- `docs/troubleshooting.md`
