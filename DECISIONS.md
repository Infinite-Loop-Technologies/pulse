# Pulse Decisions Log

This file is a running record of architectural/product decisions and tradeoffs.

## 2026-02-11: Start with CEF-first shell

Decision:
- Build a CEF-native shell first, with React UI embedded as trusted UI context.

Why:
- Fastest path to a working browser prototype with native web content.
- Keeps long-term option open to integrate Tao later.

Alternatives considered:
- Tao-first windowing with delayed CEF integration.
- Browser-only web prototype without native content panes.

Rejected because:
- Tao-first delayed core browser validation.
- Web-only prototype cannot validate real host/content isolation model.

## 2026-02-12: Separate UI context and content tab contexts

Decision:
- Keep one trusted UI browser and independent content browsers per tab id.

Why:
- Security boundary clarity.
- Real-browser behavior per tab.

Alternatives considered:
- Single webview with iframes.

Rejected because:
- Fails real browser model and cross-origin embedding reliability.

## 2026-02-12: Persist session with atomic file snapshots + backup

Decision:
- Use versioned JSON envelope with primary/backup files and temp-file commit.

Why:
- Minimal moving parts, crash-safe enough for prototype dogfooding.

Alternatives considered:
- Immediate SQLite store.
- In-memory only.

Rejected because:
- SQLite adds complexity before schema stabilizes.
- In-memory loses user trust/data between runs.

## 2026-02-13: Command registry with capability tags in UI

Decision:
- Introduce explicit command definitions (id, capability, shortcuts, metadata).

Why:
- Prevent conceptual drift and ad-hoc shortcut sprawl.
- Establish a bridge toward enforceable capability policy.

Alternatives considered:
- One-off button handlers + scattered keydown checks.

Rejected because:
- Hard to audit, hard to evolve, brittle for future capsules.

## 2026-02-13: Host emits runtime tab metadata events

Decision:
- Push `pulse:tab-runtime-updated` from host to trusted UI on address/title changes.

Why:
- Fix omnibox/title drift from real navigation and redirects.

Alternatives considered:
- Polling current URL from UI.

Rejected because:
- Polling is inefficient and races navigation state.

## 2026-02-13: Hide native content overlays when settings modal is open

Decision:
- Temporarily set host content visibility false while modal is open.

Why:
- Prevent native overlay from visually appearing above DOM modal.

Alternatives considered:
- Pure CSS z-index adjustments.

Rejected because:
- Native CEF overlays are outside DOM stacking context.
