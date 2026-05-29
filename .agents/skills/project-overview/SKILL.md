---
name: project-overview
description: "Project map - Vite + React + Tauri layout, feature ownership, local API boundaries, runtime bundling, and validation entry points. Use when exploring unfamiliar code, locating where a layer lives, onboarding, or deciding which project skill to load. Triggers on 'where does X live', 'project structure', 'architecture overview', 'repo map', 'onboarding', 'Tauri boundary', 'API boundary'."
user-invocable: false
---

# Project Overview

This repo is a local-first desktop client for a local agent runtime. The product goal is to make local agent work usable without asking people to manage terminals, runtime paths, credentials, or config files by hand.

This is a curated map, not a complete tree. Check the real directory before making broad moves.

## Stack

- Desktop shell: Tauri 2
- Frontend: Vite, React 19, TypeScript, TailwindCSS 4
- Routing: `react-router` hash router
- Server state: `@tanstack/react-query`
- UI primitives: local shadcn-style components in `src/components/ui`, plus Radix primitives when needed
- Icons: `lucide-react`
- Native code: Rust under `src-tauri`

Exact versions live in `package.json`.

## Layout Map

| Area | Location |
| --- | --- |
| App root | `src/main.tsx`, `src/app/App.tsx` |
| Providers | `src/app/providers.tsx` |
| Route registration | `src/app/router.tsx` |
| App shell | `src/components/layout/` |
| Shared UI primitives | `src/components/ui/` |
| Shared page pieces | `src/components/common/` |
| Feature pages and panels | `src/features/<feature>/` |
| API client | `src/lib/hermes/api.ts` |
| Backend interface | `src/lib/hermes/backend.ts` |
| Query helpers | `src/lib/hermes/queries.ts` |
| Shared protocol types | `src/lib/hermes/types.ts` |
| Tauri helpers | `src/lib/tauri.ts` |
| Tauri commands/native code | `src-tauri/src/` |
| Tauri config/resources | `src-tauri/tauri.conf.json`, `src-tauri/resources/` |
| Runtime bundle docs | `docs/runtime-bundling.md` |
| Product and integration docs | `docs/product-plan.md`, `docs/hermes-integration.md` |

## Data and Runtime Flow

Use this boundary for local integration:

```text
React UI
  -> React Query / feature hook
  -> HermesBackend
  -> HermesApiClient
  -> Tauri command only when native access is required
  -> local gateway process
  -> local API server at http://127.0.0.1:8642
```

Frontend code should not call random transports directly. Add new protocol behavior behind `HermesBackend` or `HermesApiClient`, then consume it through query hooks or feature hooks.

## Feature Ownership

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

## Skill Routing

- UI and component work: read `react`.
- Route or feature placement: read `spa-routes`.
- API/query/cache work: read `data-fetching-architecture`.
- Tauri/runtime/native work: read `desktop-runtime`.
- Chat streams and trace UI: read `agent-tracing`.
- Copy: read `microcopy` and the matching language reference if needed.
- Type-heavy changes: read `typescript`.
- Test design or failure triage: read `testing` and `local-testing`.

## Default Validation

Run focused validation after meaningful frontend or shared TypeScript changes:

```bash
pnpm build
```

Run this after Rust, Tauri config, resource, or runtime-management changes:

```bash
cd src-tauri && cargo check
```

Use `pnpm dev` for browser UI checks and `pnpm tauri:dev` when behavior depends on real Tauri APIs.
