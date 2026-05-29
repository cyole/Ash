---
name: react-ui
description: Hermes React UI conventions for Vite, React 19, TailwindCSS, local shadcn-style components, lucide icons, responsive app-shell layouts, and feature-owned components. Use before writing or editing `.tsx` UI under `src/**`, especially pages, panels, chat UI, forms, buttons, empty states, and layout.
user-invocable: false
---

# Hermes React UI Guide

## Component Priority

1. Reuse project components in `src/components/ui` and `src/components/common`.
2. Keep domain components under `src/features/<feature>/components`.
3. Use Radix primitives only when a matching local UI component does not exist.
4. Use `lucide-react` for icons in icon buttons and tool actions.
5. Add custom primitives only when the project lacks a reusable equivalent.

## Styling

- Use Tailwind classes and existing CSS variables from `src/styles/globals.css`.
- Use `cn()` from `src/lib/utils.ts` for conditional classes.
- Prefer `gap`, grid tracks, `min-h-0`, `min-w-0`, and `overflow-*` over margin chains.
- Keep cards restrained: radius 8px or less unless matching an existing component.
- Use semantic colors such as `bg-background`, `bg-card`, `text-muted-foreground`, `border-border`, `bg-accent`.
- Avoid one-off hardcoded colors unless representing a domain status that is not covered by tokens.

## Lobe-Inspired Desktop Density

- Hermes is a desktop client. Optimize for compact, repeat-use density rather than mobile-friendly oversized controls.
- Base UI text should feel close to LobeHub/LobeChat: body 13-14px, metadata 10-12px, compact titles 15-16px, with line-height doing the readability work.
- Use the global Hermes tokens in `src/styles/globals.css` first: `--hermes-titlebar-height`, `--hermes-chat-header-height`, `--hermes-sidebar-width`, `--hermes-action-sm`, `--hermes-action-md`, `--hermes-radius-*`, and `--hermes-shadow-*`.
- Action icons should match Lobe UI density: 24px for small inline actions, 28px for toolbar actions, 32px only for primary/send or prominent header actions.
- Prefer borderless/ghost icon buttons with subtle hover fill. Message actions should stay hidden until hover or active popup state.
- Sidebar rows are compact: 32px row height, 13px labels, 14-15px icons, 6-8px radius, and muted gray text until active.
- Chat assistant messages use document layout: avatar/title row plus raw markdown content. Avoid wrapping assistant content in cards unless it is a tool/result block.
- User messages can be a small filled bubble with 12-14px padding, not a large card.
- Composer uses a single rounded input surface with internal 8-16px padding, compact action bars, and a 28-32px send button.
- On macOS/Tauri, keep native traffic lights. Use `titleBarStyle: "Overlay"` and draw only custom tabs/toolbars in React.

## Layout Rules

- App pages should fit inside `AppLayout`; do not create marketing hero sections for tool surfaces.
- For split panes and chat layouts, set `min-h-0` on flex/grid children that must scroll.
- Put scrolling on the smallest useful container.
- Avoid nesting cards inside cards. Use sections, panels, or repeated item cards.
- Button, badge, input, and toolbar dimensions should stay stable across hover, loading, and empty states.

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
