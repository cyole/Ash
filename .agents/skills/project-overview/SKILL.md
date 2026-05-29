---
name: project-overview
description: Hermes Desktop project map for orientation. Use when locating where UI, routes, Hermes API clients, Tauri commands, runtime bundling, docs, or feature modules live. Triggers on project structure, architecture overview, where does X live, onboarding, repo map, or unfamiliar code exploration.
user-invocable: false
---

# Hermes Project Overview

Hermes Desktop is a local-first desktop client for Hermes Agent. The product goal is to make Hermes usable without asking people to manage terminals, local servers, credentials, or config files by hand.

## Stack

- Desktop shell: Tauri 2
- Frontend: Vite, React 19, TypeScript, TailwindCSS 4
- Routing: `react-router` hash router
- Server state: `@tanstack/react-query`
- UI primitives: local shadcn-style components in `src/components/ui`
- Icons: `lucide-react`
- Native code: Rust under `src-tauri`

## Key Files

| Area | Location |
| --- | --- |
| App providers | `src/app/providers.tsx` |
| Router | `src/app/router.tsx` |
| App shell | `src/components/layout/` |
| Feature pages | `src/features/<feature>/` |
| Hermes API client | `src/lib/hermes/api.ts` |
| Hermes backend interface | `src/lib/hermes/backend.ts` |
| Hermes query helpers | `src/lib/hermes/queries.ts` |
| Hermes shared types | `src/lib/hermes/types.ts` |
| Tauri helpers | `src/lib/tauri.ts` |
| Native runtime code | `src-tauri/src/` |
| Runtime bundle docs | `docs/runtime-bundling.md` |
| Product and integration docs | `docs/product-plan.md`, `docs/hermes-integration.md` |

## Architecture Boundary

Use this flow for local Hermes integration:

```text
React UI
  -> HermesBackend interface
  -> HermesApiClient
  -> Tauri runtime manager where native access is required
  -> Hermes gateway process
  -> local API server at http://127.0.0.1:8642
```

Frontend code should not call random Hermes transports directly. Add new protocol behavior behind `HermesBackend` or `HermesApiClient`, then consume it through query hooks or feature hooks.

## Feature Pattern

Each feature owns its page, local components, hooks, and domain types:

```text
src/features/chat/
  ChatPage.tsx
  components/
  hooks/
  stream-events.ts
  types.ts
```

Keep shared UI small and reusable under `src/components`. Keep domain-specific UI inside the feature.

## Default Validation

Run focused validation after meaningful changes:

```bash
pnpm build
cd src-tauri && cargo check
```

For UI behavior, run the Vite app with:

```bash
pnpm dev
```
