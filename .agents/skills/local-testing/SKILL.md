---
name: local-testing
description: "Local validation guide - Vite browser checks, Tauri shell checks, Rust `cargo check`, UI smoke tests, and focused build triage. Use when deciding what to run after changes, debugging local app behavior, verifying desktop runtime work, or investigating build failures. Triggers on 'local test', 'smoke test', 'pnpm build', 'tauri dev', 'cargo check', 'browser check', 'manual test'."
user-invocable: false
---

# Local Testing

## Default Commands

Run these after meaningful frontend or shared TypeScript changes:

```bash
pnpm build
```

Run this after Rust, Tauri config, resource, or runtime-management changes:

```bash
cd src-tauri && cargo check
```

Run both when the change crosses the frontend/native boundary.

## Dev Servers and URLs

Frontend only:

```bash
pnpm dev
```

Vite serves at:

```text
http://127.0.0.1:1420
```

Full desktop shell:

```bash
pnpm tauri:dev
```

Use the full Tauri app when testing native commands, file dialogs, process control, app data paths, window behavior, or bundled runtime resources.

## Browser UI Smoke Flow

When the change affects visible React UI:

1. Start `pnpm dev`.
2. Open `http://127.0.0.1:1420`.
3. Check the changed route at desktop and narrow widths.
4. Exercise the main action, empty state, loading/error state if reachable.
5. Inspect for text overlap, broken scroll containers, missing accessible labels, and console errors.

Use the in-app Browser plugin when available. If using a CLI browser tool, take a fresh snapshot after navigation or DOM changes before interacting with element refs.

## UI Checklist

- App shell renders without overflow at narrow and desktop sizes.
- Sidebar navigation reaches changed routes.
- Empty, loading, error, and success states fit without text overlap.
- Chat streaming can start, stop, and retry.
- Runtime/API errors are visible and actionable.

## Build Failure Triage

- For TypeScript errors, read the first failing file and fix root causes before rerunning.
- For build failures after UI edits, check imports and type-only imports first.
- For Tauri failures, run `cargo check` inside `src-tauri` and inspect the first Rust compiler error.
- For API failures, inspect `src/lib/hermes/api.ts` and the integration docs before changing UI state.
- If a command produces many errors, fix the first real source error rather than chasing downstream noise.

## Avoid

- Do not run long all-environment commands when a focused build or `cargo check` is enough.
- Do not require a real local runtime for pure UI layout changes.
- Do not hide failed validation in final notes.
