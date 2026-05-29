---
name: desktop-runtime
description: "Tauri desktop runtime guide - native command boundaries, runtime preparation, process control, bundled resources, app data paths, credentials, diagnostics, and frontend-to-native contracts. Use when editing `src-tauri/**`, `src/lib/tauri.ts`, runtime start/stop/status code, filesystem access, or app-managed config. Triggers on 'Tauri', 'runtime', 'gateway', 'native command', 'process', 'credentials', 'diagnostics', 'app data'."
user-invocable: false
---

# Desktop Runtime Guide

The desktop app should feel like the local agent runtime is built into the app while keeping that runtime isolated behind native process and HTTP boundaries.

## Architecture

- The app owns an app-managed runtime under the app data directory.
- The bundled archive lives under `src-tauri/resources/hermes-runtime/`.
- The app uses an app-owned `hermes-home`.
- Import user config only as a first-run source; do not mutate the user's original `~/.hermes`.
- The default local API server is `http://127.0.0.1:8642`.

Read these docs before larger runtime changes:

- `docs/hermes-integration.md`
- `docs/runtime-bundling.md`

## Boundary Rules

- Frontend protocol calls go through `HermesBackend` / `HermesApiClient`.
- Tauri commands are for native actions: runtime detection, process control, filesystem, credentials, notifications, diagnostics, updater, and app-owned resource lookup.
- Keep secrets out of frontend storage. Prefer OS credential storage or app-owned native storage.
- Long-running native work should report progress or expose logs so the UI can show status without blocking.
- The Rust side owns path resolution. Do not rely on the frontend process working directory.

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

## Implementation Pattern

1. Define a narrow Tauri command that accepts typed parameters.
2. Validate inputs at the command boundary.
3. Resolve paths from app data or bundled resources.
4. Execute processes with structured args, not interpolated shell strings.
5. Return a stable serializable response shape to TypeScript.
6. Normalize the frontend wrapper in `src/lib/tauri.ts` or `src/lib/hermes/backend.ts`.

## Implementation Checklist

- Validate all inputs at the Tauri command boundary.
- Resolve paths from app data/resources, not from the process working directory.
- Avoid shell interpolation. Pass arguments as structured arrays where possible.
- Capture stdout/stderr for user-visible diagnostics.
- Make runtime preparation idempotent.
- Never print API keys, tokens, or provider secrets.
- Keep app-managed data separate from user-owned `~/.hermes`.
- Prefer explicit status states: missing, preparing, ready, running, stopped, error.

## Validation

After native changes:

```bash
cd src-tauri && cargo check
pnpm build
```

Use `pnpm tauri:dev` when behavior depends on real Tauri APIs, app resources, filesystem permissions, window behavior, process control, or OS credentials.
