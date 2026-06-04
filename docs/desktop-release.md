# Desktop Release

Ash releases are built by `.github/workflows/release-desktop.yml`.

The workflow builds:

- macOS arm64: `aarch64-apple-darwin`
- macOS x64: `x86_64-apple-darwin`
- Windows x64: default Windows target

Each matrix job generates the matching bundled Hermes runtime archive before
running Tauri:

```txt
src-tauri/resources/hermes-runtime/hermes-runtime-darwin-arm64.tar.gz
src-tauri/resources/hermes-runtime/hermes-runtime-darwin-x64.tar.gz
src-tauri/resources/hermes-runtime/hermes-runtime-windows-x64.tar.gz
```

It uploads normal installers, updater signatures, and `latest.json` to GitHub
Releases. The app updater checks:

```txt
https://github.com/cyole/Ash/releases/latest/download/latest.json
```

## Required Secrets

`TAURI_SIGNING_PRIVATE_KEY` is required. It must contain the private updater
key that matches the public key in `src-tauri/tauri.conf.json`.

This workspace generated that key at:

```txt
/Users/cyole/.tauri/ash-desktop.key
```

`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is optional. The generated key currently
has no password, so this secret can be left empty unless the key is rotated.

## System Code Signing Secrets

Tauri updater signing and operating-system code signing are separate. Updater
signing is required for auto-update. OS code signing is optional in the
workflow only so draft builds can still be produced before certificates are
available.

macOS production signing uses Apple Developer certificates. If
`APPLE_CERTIFICATE` is missing, the workflow keeps ad-hoc signing
(`APPLE_SIGNING_IDENTITY=-`). For Developer ID distribution, configure:

```txt
APPLE_CERTIFICATE
APPLE_CERTIFICATE_PASSWORD
KEYCHAIN_PASSWORD
```

Then configure one notarization path:

```txt
APPLE_API_ISSUER
APPLE_API_KEY
APPLE_API_PRIVATE_KEY
```

or:

```txt
APPLE_ID
APPLE_PASSWORD
APPLE_TEAM_ID
```

`APPLE_CERTIFICATE` is the base64 encoded `.p12` export. The workflow writes
the App Store Connect private key to a temporary file and exposes
`APPLE_API_KEY_PATH` only inside the CI runner.

Windows Authenticode signing uses a base64 encoded `.pfx` certificate:

```txt
WINDOWS_CERTIFICATE
WINDOWS_CERTIFICATE_PASSWORD
WINDOWS_TIMESTAMP_URL
```

`WINDOWS_TIMESTAMP_URL` is optional and defaults to
`http://timestamp.digicert.com`. If `WINDOWS_CERTIFICATE` is missing, Windows
installers are built without Authenticode signing.

## Release Flow

1. Bump `version` in `package.json`, `src-tauri/Cargo.toml`, and
   `src-tauri/tauri.conf.json`.
2. Run local checks:

   ```bash
   pnpm check
   ```

3. Create and push a version tag:

   ```bash
   git tag ash-v0.1.0
   git push origin ash-v0.1.0
   ```

Tag releases are published immediately so installed apps can read
`latest.json`. Manual workflow runs and `release` branch runs default to draft
releases, which are useful for verifying installers before publishing.

## Runtime Bundles

The Tauri installer includes `src-tauri/resources/hermes-runtime`. Generated
archives are ignored by git, so the release workflow builds them in CI before
packaging:

- `scripts/build-hermes-runtime.sh` builds macOS archives.
- `scripts/build-hermes-runtime.ps1` builds Windows archives.

The workflow verifies that the generated archive exists and contains
`hermes-agent/runtime-build-manifest.json` before running `tauri-action`.

## Code Signing Notes

Tauri update signatures are configured and required for auto-update. The public
key lives in `src-tauri/tauri.conf.json`; the private key must stay in GitHub
Secrets.

macOS uses ad-hoc signing until Apple certificate secrets are present. When a
Developer ID Application certificate is imported, the workflow requires
notarization credentials.

Windows installers are Authenticode-signed only when the Windows certificate
secrets are present.

## Windows Installer Format

Keep NSIS/MSI as the primary Windows release path for now. The updater metadata
is uploaded with `updaterJsonPreferNsis: true`, which matches Tauri updater's
normal GitHub Releases flow.

MSIX is possible as a separate distribution track, but it should not replace
the NSIS updater path without redesigning the update model. MSIX normally needs
its own manifest, certificate/trust setup, and either Microsoft Store or App
Installer style updates.
