# Pulse Site

Marketing/product website for Pulse, built with Next.js + Tailwind v4 + shadcn/ui.

## Local Development

From repo root:

```bash
pnpm dev:site
```

Or directly:

```bash
pnpm --dir apps/site dev
```

## Environment Variables

- `NEXT_PUBLIC_GITHUB_REPO` (example: `owner/repo`)
- `NEXT_PUBLIC_WINDOWS_INSTALLER_URL` (optional)

Download button behavior:

1. If `NEXT_PUBLIC_WINDOWS_INSTALLER_URL` is set, it uses that URL.
2. Otherwise it falls back to:
   `https://github.com/<NEXT_PUBLIC_GITHUB_REPO>/releases/latest/download/Pulse-Setup.exe`

## Build

```bash
pnpm --dir apps/site build
```

## Deploy

Recommended: Vercel Git integration with project root set to `apps/site`.

Optional manual workflow: `/.github/workflows/vercel-site.yml`.
