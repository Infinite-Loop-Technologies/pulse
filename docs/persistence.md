# Persistence Design (Prototype)

Pulse now persists the UI workspace/session so the app can be dogfooded as a daily browser shell.

## Goals

- Crash-safe writes (no partial JSON commits)
- Automatic fallback/recovery from corruption
- Versioned schema for future migrations
- Minimal, explicit bridge surface between UI and host

## Storage Location

State is stored under the Pulse app-data root:

- Root: `%LOCALAPPDATA%\Pulse` (or `%LOCALAPPDATA%\$PULSE_CACHE_ROOT` when overridden)
- Primary: `state/workspace-state.json`
- Backup: `state/workspace-state.backup.json`

## On-Disk Format

```json
{
  "schema_version": 1,
  "updated_at_unix_ms": 1739350000000,
  "ui_state": { "...": "UI-managed JSON payload" }
}
```

`ui_state` is intentionally UI-owned so the React shell can evolve its internal shape while the host remains minimal.

## Write Strategy

When saving:

1. Serialize envelope to a temp file (`workspace-state.tmp.json`)
2. Flush and `sync_all` temp file
3. Rotate primary -> backup
4. Rename temp -> primary

If a save is interrupted, Pulse can still recover from backup.

## Read + Recovery Strategy

On load:

1. Read/parse primary
2. If primary fails, read backup
3. If backup succeeds, restore primary from backup
4. If neither is valid, boot with defaults

Legacy unversioned payloads are treated as schema `v0` and auto-migrated to `v1`.

## Bridge Contract

Trusted Pulse UI pages get:

- `window.__pulseHost.send(...)` for tab/layout commands
- `window.__pulseHost.loadState(): string | null`
- `window.__pulseHost.saveState(serialized: string): boolean`

Access is origin-gated to the configured Pulse UI origin.

## Next Hardening Steps

- Add payload checksums and explicit integrity verification
- Add deterministic migration test fixtures
- Move from whole-snapshot writes to typed host-owned domain tables
- Add optional synced profile encryption
