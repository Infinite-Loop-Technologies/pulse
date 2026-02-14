# Deployment and Updates

Pulse targets fast install + reliable updates. Planned packaging stack:

- Installer and update artifacts: Velopack
- Build/release automation: GitHub Actions
- Optional local workflow runs: `act` (later)

## Planned Pipeline

1. Build `apps/ui` static bundle
2. Build `apps/shell` release executable
3. Assemble application layout (CEF binaries + shell + UI assets)
4. Run Velopack packaging
5. Publish installers + delta/full update packages
6. Publish release metadata/feed

## Notes

- Differential updates are a release requirement.
- We should keep deterministic build inputs for reproducibility.
- Signing/notarization steps will be platform-specific and added after milestone 1.

