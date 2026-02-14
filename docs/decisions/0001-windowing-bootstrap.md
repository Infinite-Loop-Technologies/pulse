# ADR-0001: Windowing Bootstrap

## Status

Accepted for prototype milestone.

## Decision

For the first runnable prototype, Pulse uses CEF's native Views-based window creation (via `cef-rs` `cefsimple` pattern) instead of integrating Tao immediately.

## Why

- Fastest path to a working CEF browser shell.
- Validates CEF runtime + process lifecycle early.
- Keeps host minimal while UI iteration happens in React/Vite.

## Follow-up

- Introduce Tao app shell once core browser state model is stable.
- Evaluate two approaches:
  - Host-owned Tao window embedding CEF native child views.
  - Off-screen rendering pipeline with Tao-managed surface.

Both paths will preserve the item/view/capability architecture.

