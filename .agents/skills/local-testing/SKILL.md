---
name: local-testing
description: Hermes local validation guide for Vite, React, Tauri, Rust, and UI smoke tests. Use when running or deciding validation after code changes, debugging local app behavior, checking desktop runtime work, or verifying build failures.
user-invocable: false
---

# Hermes Local Testing

## Default Checks

Run these after meaningful frontend or shared TypeScript changes:

```bash
pnpm build
```

Run this after Rust, Tauri config, resource, or runtime-management changes:

```bash
cd src-tauri && cargo check
```

Run both when the change crosses the frontend/native boundary.

## Dev Servers

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

## UI Smoke Test Checklist

- App shell renders without overflow at narrow and desktop sizes.
- Sidebar navigation reaches changed routes.
- Empty, loading, error, and success states fit without text overlap.
- Chat streaming can start, stop, and retry.
- Runtime/API errors are visible and actionable.

## Focused Debugging

- For TypeScript errors, read the first failing file and fix root causes before rerunning.
- For build failures after UI edits, check imports and type-only imports first.
- For Tauri failures, run `cargo check` inside `src-tauri` and inspect the first Rust compiler error.
- For Hermes API failures, inspect `src/lib/hermes/api.ts` and the integration docs before changing UI state.

## Avoid

- Do not run long all-environment commands when a focused build or `cargo check` is enough.
- Do not require a real Hermes runtime for pure UI layout changes.
- Do not hide failed validation in final notes.
