---
name: desktop-runtime
description: Hermes Tauri desktop runtime guide. Use when editing `src-tauri/**`, runtime preparation, gateway start/stop/status, bundled Hermes resources, app data paths, credentials, filesystem access, process management, diagnostics, or frontend-to-native command boundaries.
user-invocable: false
---

# Hermes Desktop Runtime Guide

Hermes Desktop should feel like Hermes Agent is built into the app, while keeping the Python runtime isolated behind a process and HTTP boundary.

## Runtime Direction

- The app owns an app-managed Hermes runtime under the app data directory.
- The bundled archive lives under `src-tauri/resources/hermes-runtime/`.
- The app uses an app-owned `hermes-home`.
- Import user config only as a first-run source; do not mutate the user's original `~/.hermes`.
- The default local API server is `http://127.0.0.1:8642`.

Read these docs before larger runtime changes:

- `docs/hermes-integration.md`
- `docs/runtime-bundling.md`

## Boundary Rules

- Frontend protocol calls go through `HermesBackend` / `HermesApiClient`.
- Tauri commands are for native actions: runtime detection, process control, filesystem, credentials, notifications, diagnostics, updater.
- Keep secrets out of frontend storage. Prefer OS credential storage or app-owned native storage.
- Long-running native work should stream or report progress so the UI can show logs and status.

## Recommended Command Groups

Native commands should be grouped by capability:

```text
runtime_status
runtime_prepare
runtime_gateway_start
runtime_gateway_stop
runtime_gateway_restart
credentials_set
credentials_get
credentials_delete
diagnostics_export
logs_list
logs_read
```

## Implementation Checklist

- Validate all inputs at the Tauri command boundary.
- Resolve paths from app data/resources, not from the process working directory.
- Avoid shell interpolation. Pass arguments as structured arrays where possible.
- Capture stdout/stderr for user-visible diagnostics.
- Make runtime preparation idempotent.
- Never print API keys, tokens, or provider secrets.

## Validation

After native changes:

```bash
cd src-tauri && cargo check
pnpm build
```

Use `pnpm tauri:dev` when the behavior depends on real Tauri APIs.
