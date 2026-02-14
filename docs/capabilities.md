# Capability Model (Draft)

Capabilities are explicit, minimally scoped permissions granted by the host:

- `browser.navigate`
- `browser.cookies.read`
- `browser.cookies.write`
- `fs.read:<scope>`
- `fs.write:<scope>`
- `terminal.exec:<profile>`
- `mcp.tool.invoke:<tool-id>`
- `network.fetch:<policy>`

## Rules

1. Deny by default.
2. Granular scopes over broad scopes.
3. User-visible grant prompts for first use.
4. Revocable grants with audit trail.
5. No direct capability inheritance between capsules unless declared.

## Host Responsibility

- Canonical capability registry
- Grant storage and revocation
- Runtime policy checks
- Security telemetry and audit logs

## UI Responsibility

- Request capabilities with clear intent text
- Show active grants per item/capsule
- Let users inspect and revoke quickly

## Prototype Host Bridge Surface

For the current browser prototype, the UI context receives only a narrow, hardcoded bridge:

- `ensure-tab`
- `activate-tab`
- `navigate-tab`
- `close-tab`
- `browser-back`
- `browser-forward`
- `browser-reload`
- `browser-stop`
- `set-content-bounds`
- `set-content-visible`
- `loadState`
- `saveState`

The host accepts these commands only from the trusted UI origin and UI browser instance. This keeps the content browser context unprivileged while enabling tab-driven navigation/layout.

The host also emits runtime updates to the UI browser context:

- `pulse:tab-runtime-updated` (tab URL/title changes from real web navigation)
