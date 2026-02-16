# Deployment and Updates

Pulse now has two delivery tracks:

1. Desktop app releases (`pulse-shell` + CEF + UI bundle) via Velopack + GitHub Releases.
2. Product website (`apps/site`, Next.js) via Vercel.

## Desktop Release Pipeline (Velopack)

### What the release workflow does

`/.github/workflows/release.yml` builds and publishes Windows installers/update packages.

1. Builds `apps/ui` static bundle.
2. Builds `pulse-shell` release executable.
3. Stages app payload in `target/velopack/payload`:
   - `pulse-shell.exe`
   - CEF runtime files from `target/release`
   - UI bundle in `ui/`
4. Runs `vpk pack` to produce:
   - `Pulse-Setup.exe`
   - `releases.win.json`
   - `*.nupkg` update packages (full + delta when previous releases are available)
5. Uploads Velopack outputs to GitHub Releases with `vpk upload github`.

Implementation entrypoint: `scripts/package-windows-release.ps1`.

### Triggering releases

- Tag push: `v0.2.0` (recommended)
- Manual: GitHub Actions `Release` workflow, provide `version` input (example: `0.2.0`)

### Auto-update URL

Release builds compile `PULSE_UPDATE_URL` to:

`https://github.com/<owner>/<repo>/releases/latest/download`

At runtime, the shell checks `PULSE_UPDATE_URL` environment variable first; otherwise it uses the compiled value.

## Website Deployment (Vercel)

`apps/site` is a standalone Next.js app (Tailwind v4 + shadcn/ui).

### Required site environment variables

- `NEXT_PUBLIC_GITHUB_REPO` example: `owner/repo`
- `NEXT_PUBLIC_WINDOWS_INSTALLER_URL` optional override for the Download button.

If `NEXT_PUBLIC_WINDOWS_INSTALLER_URL` is not set, the button defaults to:

`https://github.com/<NEXT_PUBLIC_GITHUB_REPO>/releases/latest/download/Pulse-Setup.exe`

### Vercel auto deploy vs GitHub Action

You have two valid options:

1. Vercel Git integration (recommended):
   - Connect the repo in Vercel.
   - Set project root directory to `apps/site`.
   - Pushes/PRs auto-deploy with Vercel bot checks.
2. Manual GitHub Action deploy:
   - Use `/.github/workflows/vercel-site.yml`.
   - Requires secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
   - Trigger with `workflow_dispatch` and choose `preview` or `production`.

Use one primary deployment mechanism for the site to avoid duplicate deploys.
