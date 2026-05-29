---
name: typescript
description: Hermes TypeScript style and type-safety guide. Use before editing `.ts` or `.tsx`, designing interfaces, parsing API responses, handling SSE payloads, writing async code, or reviewing type quality.
user-invocable: false
---

# Hermes TypeScript Guide

## Type Safety

- Prefer `interface` for object shapes and React props.
- Use `type` for unions, intersections, and mapped/conditional types.
- Avoid `any`. Use `unknown`, narrow it, then expose a precise type.
- Prefer `Record<string, unknown>` for parsed JSON records.
- Use `as const satisfies SomeShape` for constant maps that must match a contract.
- Use `@ts-expect-error` only with a short reason. Do not use `@ts-ignore`.
- Keep shared protocol types in `src/lib/hermes/types.ts`; keep feature-only UI types beside the feature.

## Imports and Exports

- Use `import type` for type-only imports.
- Prefer named exports for project modules.
- Keep imports readable and let tooling handle final sorting.
- Do not introduce barrel files that hide ownership unless the feature already uses that pattern.

## Async and Errors

- Prefer `async` / `await`.
- Use `Promise.all` only when operations are independent and failure behavior is clear.
- Never silently swallow errors with `.catch(() => fallback)`. Log, surface, or intentionally convert the error.
- Reuse a captured timestamp when several objects need the same `createdAt`.

## Parsing External Data

- Treat Hermes API and SSE payloads as untrusted at the boundary.
- Normalize once in `src/lib/hermes/api.ts`, `src/lib/hermes/types.ts`, or a feature parser such as `src/features/chat/stream-events.ts`.
- Keep fallback handling local to the boundary; downstream components should receive stable shapes.
- Preserve raw error detail when useful, but do not leak secrets into UI or logs.

## UI Types

- React props should be narrow and named after the component, for example `ChatComposerProps`.
- Prefer callback prop names like `onSend`, `onStop`, `onRetry`, `onInputChange`.
- Model loading, empty, error, and streaming states explicitly instead of inferring them from unrelated data.
