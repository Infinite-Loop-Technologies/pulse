# Pulse Glossary

## Browser UI (Trusted UI Context)
The React/Vite shell that renders Pulse chrome (sidebar, omnibox, settings, command UI). It is trusted and can call the host bridge.

## Content Tab
A native CEF browser instance representing real web content for a logical tab id.

## Host Bridge
The narrow API exposed to trusted UI (`window.__pulseHost`) for command dispatch and state load/save.

## Shell State
Host-managed runtime state for UI browser id, native content tab sessions, active tab, and content bounds/visibility.

## Workspace Item
A node in the sidebar tree. Current kinds: `group`, `browser-tab`, `file-ref`.

## Group
A container item in the tree used to organize tabs/files.

## Logical Tab ID
Stable workspace identifier for a browser tab item, mapped to one native content tab session.

## Runtime Tab Update
Host-to-UI event (`pulse:tab-runtime-updated`) containing actual tab URL/title changes observed from CEF.

## Command
A user intent with stable id and metadata (label, capability, default shortcuts), executed by UI action routing.

## Capability Tag
A named permission category associated with commands (for example `browser.navigate`, `workspace.mutate`).

## Shortcut Map
A mapping from command ids to keyboard bindings. Defaults are defined in the command registry.

## Capsule
Planned plugin/runtime unit in Pulse. Capsules will declare required capabilities and run in constrained contexts.

## Orchestrator
Planned future host subsystem coordinating item/view lifecycle, capsule execution, and capability grants.

## Persistence Envelope
Versioned on-disk state wrapper with `schema_version`, timestamp, and UI payload.

## Primary / Backup State
Primary snapshot file plus backup snapshot used for crash/corruption recovery.
