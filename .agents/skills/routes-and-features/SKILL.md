---
name: routes-and-features
description: Hermes routing and feature module guide. Use when adding, moving, or editing routes in `src/app/router.tsx`, creating pages under `src/features/**`, changing navigation, or deciding whether code belongs in route, layout, feature, common component, or lib.
user-invocable: false
---

# Hermes Routes and Features

Hermes uses a small route entry and feature-owned pages:

- `src/app/router.tsx` registers routes.
- `src/components/layout/AppLayout.tsx` owns the main shell.
- `src/features/<feature>/<FeaturePage>.tsx` owns each page.
- `src/features/<feature>/components` owns feature-specific UI.

## Adding a Route

1. Create or reuse a feature folder under `src/features/<name>/`.
2. Put the page component in that feature folder.
3. Register the route in `src/app/router.tsx`.
4. Add navigation in `src/components/layout/AppSidebar.tsx` if the page should be user-visible.
5. Keep URL paths stable and lowercase.

## What Belongs Where

| Code | Location |
| --- | --- |
| Route registration | `src/app/router.tsx` |
| App shell, sidebar, status bar | `src/components/layout/` |
| Shared UI primitives | `src/components/ui/` |
| Shared simple page pieces | `src/components/common/` |
| Domain page and panels | `src/features/<feature>/` |
| Hermes protocol/client logic | `src/lib/hermes/` |
| Tauri native bridge helpers | `src/lib/tauri.ts` |

## Feature Folder Shape

Prefer this shape as features grow:

```text
src/features/<feature>/
  <FeaturePage>.tsx
  components/
  hooks/
  types.ts
  utils.ts
```

Do not move shared code out of a feature until at least two features need it or the boundary is genuinely protocol-level.

## Route Review

When routing changes, verify:

- The page is reachable from the sidebar or intended entry point.
- The index route still lands on a useful first screen.
- The Tauri hash route works after refresh.
- The page fits inside `AppLayout` without creating nested app shells.
