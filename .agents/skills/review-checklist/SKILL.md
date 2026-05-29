---
name: review-checklist
description: "Code review checklist - correctness, desktop/runtime safety, streaming behavior, TypeScript quality, UI regressions, secrets, validation, and recurring mistakes. Use when reviewing a diff, branch, PR, or recent changes. Triggers on 'review', 'code review', 'review diff', 'PR review', 'audit changes', 'check this change'."
user-invocable: false
---

# Review Checklist

## Correctness

- Does the change preserve the `HermesBackend` boundary?
- Are fallback API endpoints localized instead of leaking into UI code?
- Are stream abort, retry, stop, and unmount paths handled?
- Are loading, empty, error, and success states explicit?
- Are timestamps, IDs, and session IDs stable enough for rendering and retries?
- Does the change avoid duplicating existing helpers or protocol normalizers?

## Desktop and Runtime

- Tauri commands validate inputs and avoid shell interpolation.
- Runtime preparation is idempotent.
- App-managed paths do not mutate the user's original `~/.hermes`.
- Native logs and diagnostics avoid secrets.
- Rust changes pass `cargo check`.
- Frontend code does not assume filesystem, process, or credential access without a Tauri boundary.

## UI

- Layout works inside the desktop app shell, including narrow widths.
- Scroll containers have `min-h-0` / `min-w-0` where needed.
- Icon-only buttons have accessible names.
- User-facing strings are clear and actionable.
- No nested card-heavy layouts or marketing surfaces in tool views.
- Button, badge, input, and toolbar dimensions stay stable across hover/loading states.

## TypeScript

- No new `any` unless there is a documented escape hatch.
- External data is parsed from `unknown` and normalized once.
- Type-only imports use `import type`.
- Helpers are not duplicated if a local utility already exists.
- No silent `.catch(() => fallback)` unless the fallback is intentionally documented and safe.

## Security and Privacy

- No hardcoded provider keys, API keys, tokens, or secrets.
- No secrets in console output, diagnostics, trace UI, or error messages.
- Local filesystem access stays behind Tauri/native boundaries.
- Do not dump large base64/blob payloads to terminal or logs.

## Validation

- Frontend/shared changes: `pnpm build`.
- Rust/Tauri/runtime changes: `cd src-tauri && cargo check`.
- UI-affecting changes: run a local smoke test when feasible.
- Bug fixes should include focused coverage when the project has a test harness for that layer.

## Findings Style

When asked for a review, lead with issues ordered by severity and cite file/line references. If there are no issues, say so and mention residual test gaps.
