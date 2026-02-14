# Troubleshooting

## `CEF initialize returned 0`

This means CEF did not initialize in the host process.

Try the following:

1. Ensure CEF bundle matches host crate line (`143.0.10` for this prototype).
2. Ensure `ninja.exe` is available (the wrapper script auto-resolves common VS locations).
3. Ensure `CEF_PATH` points to a valid extracted bundle with `archive.json`, `libcef.dll`, and `locales/`.
4. Kill stale browser processes and retry.
5. Check terminal elevation state on Windows:
   - Elevated (Administrator) shells can cause CEF to auto de-elevate and return `0` in the parent process.
   - Debug builds now add `--do-not-de-elevate` automatically to avoid this during local development.
   - Quick check: `whoami /groups | findstr /i "Mandatory Label"`
6. Run from an interactive desktop session (GUI-capable), not a headless shell session.
7. If you changed CEF versions, rerun `pnpm dev:shell` once so the launcher can resync runtime files into `target/debug`.

## Re-export a compatible CEF bundle

Example using `export-cef-dir` from `cef-rs`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-cef.ps1
$env:CEF_PATH="$env:USERPROFILE/.local/share/cef-pulse"
pnpm dev:shell
```

## Browser panel does not update

If the sidebar/omnibox updates but the web content pane does not:

1. Confirm you're running the full shell (`pnpm dev`), not only the UI in a normal browser tab.
2. Ensure the UI was opened from `PULSE_UI_URL` (default `http://localhost:5173`) so the host bridge is injected.
3. Ensure commands are targeting a selected browser tab item (non-browser items intentionally hide the native content pane).
4. Rebuild after host changes (`pnpm check`) to ensure the renderer subprocess is running the same updated executable.

## `Cannot add multiple Chrome style BrowserViews`

This comes from CEF Chrome runtime restrictions when trying to compose multiple browser views in one native window.

Current prototype fix:
1. Use CEF `RuntimeStyle::ALLOY` for composed multi-view layouts.
2. Keep one UI browser view plus per-tab content browser views managed by the host.
