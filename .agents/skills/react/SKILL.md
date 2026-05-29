---
name: react
description: "React component conventions - local shadcn-style primitives, Radix where needed, Tailwind CSS variables, lucide icons, React Router, compact desktop layout, accessibility, and feature-owned components. Use when writing or editing `.tsx` under `src/**`. Triggers on 'new component', 'new page', 'edit layout', 'Tailwind', 'Radix', 'lucide', 'button', 'dialog', 'sidebar', 'chat UI', 'responsive'."
user-invocable: false
---

# React Component Writing Guide

## Component Priority

1. Reuse project components in `src/components/ui` and `src/components/common`.
2. Keep domain components under `src/features/<feature>/components`.
3. Use Radix primitives only when a matching local UI component does not exist.
4. Use `lucide-react` for icons in icon buttons and tool actions.
5. Add custom primitives only when the project lacks a reusable equivalent.

## Styling

- Use Tailwind classes and existing CSS variables from `src/styles/globals.css`.
- Use `cn()` from `src/lib/utils.ts` for conditional classes.
- Prefer `gap`, grid tracks, `min-h-0`, `min-w-0`, and scoped `overflow-*` over margin chains.
- Keep cards restrained: radius 8px or less unless matching an existing component.
- Use semantic colors such as `bg-background`, `bg-card`, `text-muted-foreground`, `border-border`, `bg-accent`.
- Avoid one-off hardcoded colors unless representing a domain status not covered by tokens.

## Desktop Density

- This is a desktop client. Optimize for compact, repeat-use density rather than marketing-page scale.
- Base UI text should usually sit around body 13-14px, metadata 10-12px, compact titles 15-16px.
- Use global app tokens first: `--hermes-titlebar-height`, `--hermes-chat-header-height`, `--hermes-sidebar-width`, `--hermes-action-sm`, `--hermes-action-md`, `--hermes-radius-*`, `--hermes-shadow-*`.
- Titlebar and sidebar can share a neutral surface; keep the main workspace clean and readable.
- Prefer borderless or ghost icon buttons with subtle hover fill.
- Chat assistant messages should read like document content. Use cards for tool/result blocks, not every assistant message.
- User messages can be compact filled bubbles with 12-14px padding.
- Composer should be a single input surface with internal padding, compact action bars, and a 28-32px send button.

## Layout

- App pages should fit inside `AppLayout`; do not create standalone shells inside feature pages.
- For split panes and chat layouts, set `min-h-0` on flex/grid children that must scroll.
- Put scrolling on the smallest useful container.
- Avoid nested cards. Use sections, panels, or repeated item cards.
- Button, badge, input, and toolbar dimensions should stay stable across hover, loading, and empty states.

## Navigation

- Use `react-router` APIs configured by `src/app/router.tsx`.
- Do not introduce framework routing assumptions outside React Router.
- User-visible pages should have sidebar navigation only when they are primary workflows.

## State and Data

- Fetch server data through `@tanstack/react-query` hooks or feature hooks, not ad hoc `useEffect` fetches in page components.
- Keep page components mostly compositional. Move orchestration into feature hooks when state grows.
- Abort long-running requests and streams on unmount or when a new request supersedes the old one.

## Accessibility

- Icon-only buttons need `aria-label`.
- Do not use clickable `div`s when a `button` or `a` is appropriate.
- Preserve keyboard flow in chat composer, sidebars, dialogs, and settings forms.
- Keep visible text inside controls short enough to fit at desktop and narrow widths.

## Common Mistakes

| Mistake | Better |
| --- | --- |
| Duplicating a button/input style inline | Use or extend `src/components/ui` |
| Putting stream state directly in many components | Centralize in a feature hook |
| Adding broad shared components too early | Start in the feature, promote after reuse |
| Hardcoding status copy in multiple places | Extract domain labels or helpers |
| Layout breaks inside Tauri window | Add `min-h-0`, `min-w-0`, and scoped overflow |
