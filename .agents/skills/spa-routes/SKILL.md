---
name: spa-routes
description: "SPA routing and feature split - thin route registration in `src/app/router.tsx`, feature-owned pages under `src/features/**`, app shell in `src/components/layout`, and sidebar navigation. Use when adding, moving, or editing routes, pages, feature modules, or navigation. Triggers on 'add route', 'new page', 'route', 'sidebar nav', 'feature folder', '`src/app/router.tsx`', '`src/features`'."
user-invocable: false
---

# SPA Routes and Features Guide

This project keeps routing small and feature ownership explicit:

- `src/app/router.tsx` registers route objects.
- `src/components/layout/AppLayout.tsx` owns the main shell.
- `src/components/layout/AppSidebar.tsx` owns primary navigation.
- `src/features/<feature>/<FeaturePage>.tsx` owns each page.
- `src/features/<feature>/components` owns feature-specific UI.

## Adding a Route

1. Create or reuse a feature folder under `src/features/<name>/`.
2. Put the page component in that feature folder.
3. Register the route in `src/app/router.tsx`.
4. Add navigation in `src/components/layout/AppSidebar.tsx` only if the page should be user-visible.
5. Keep URL paths stable, lowercase, and human-readable.

## What Belongs Where

| Code | Location |
| --- | --- |
| Route registration | `src/app/router.tsx` |
| App shell, sidebar, status bar | `src/components/layout/` |
| Shared UI primitives | `src/components/ui/` |
| Shared page pieces | `src/components/common/` |
| Domain page and panels | `src/features/<feature>/` |
| Feature hooks/types/utils | `src/features/<feature>/hooks`, `types.ts`, `utils.ts` |
| Protocol/client logic | `src/lib/hermes/` |
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
- Route-level loading and empty states still fit in the desktop shell.
