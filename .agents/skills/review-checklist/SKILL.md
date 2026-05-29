---
name: review-checklist
description: Hermes code review checklist. Use when reviewing a diff, PR, branch, or recent changes. Focuses on correctness, desktop/runtime safety, streaming behavior, TypeScript quality, UI regressions, secrets, and validation.
user-invocable: false
---

# Hermes Review Checklist

## Correctness

- Does the change preserve the `HermesBackend` boundary?
- Are fallback API endpoints localized instead of leaking into UI code?
- Are stream abort, retry, stop, and unmount paths handled?
- Are loading, empty, error, and success states explicit?
- Are timestamps, IDs, and session IDs stable enough for rendering and retries?

## Desktop and Runtime

- Tauri commands validate inputs and avoid shell interpolation.
- Runtime preparation is idempotent.
- App-managed paths do not mutate the user's original `~/.hermes`.
- Native logs and diagnostics avoid secrets.
- Rust changes pass `cargo check`.

## UI

- Layout works inside the desktop app shell, including narrow widths.
- Scroll containers have `min-h-0` / `min-w-0` where needed.
- Icon-only buttons have accessible names.
- User-facing strings are clear and actionable.
- No nested card-heavy layouts or marketing surfaces in tool views.

## TypeScript

- No new `any` unless there is a documented escape hatch.
- External data is parsed from `unknown` and normalized once.
- Type-only imports use `import type`.
- Helpers are not duplicated if a local utility already exists.

## Security and Privacy

- No hardcoded provider keys, API keys, tokens, or secrets.
- No secrets in console output, diagnostics, trace UI, or error messages.
- Local filesystem access stays behind Tauri/native boundaries.

## Validation

- Frontend/shared changes: `pnpm build`.
- Rust/Tauri/runtime changes: `cd src-tauri && cargo check`.
- UI-affecting changes: run a local smoke test when feasible.
- Bug fixes should include focused coverage when the project has a test harness for that layer.
