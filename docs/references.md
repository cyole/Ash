# Reference Projects

This document lists the projects we use as product, UX, and technical
references for Ash.

These references are not templates to copy directly. They define the product
surface, integration lessons, and visual/interaction direction we want to learn
from while keeping Ash simple, obvious, fast, and useful.

## Summary

| Project | Reference Role | What We Learn |
| --- | --- | --- |
| [fathah/hermes-desktop](https://github.com/fathah/hermes-desktop) | Desktop Hermes integration | Installer flow, local/remote runtime mode, gateway control, provider setup, SSE chat, logs, diagnostics |
| [EKKOLearnAI/hermes-web-ui](https://github.com/EKKOLearnAI/hermes-web-ui) | Hermes feature surface | Chat, sessions, channels, usage, jobs, models, profiles, files, group chat, skills, memory, logs, terminal, settings |
| [lobehub/lobehub](https://github.com/lobehub/lobehub) | Agent workspace and product feel | Agents as units of work, scheduling/reporting, agent teams, project/workspace structure, editable memory, approachable AI workspace design |

## fathah/hermes-desktop

Repository:

- [https://github.com/fathah/hermes-desktop](https://github.com/fathah/hermes-desktop)

Positioning:

- A native desktop companion for installing, configuring, and chatting with
  Hermes Agent.
- It proves that a normal desktop app can wrap Hermes Agent installation,
  provider setup, gateway control, chat, sessions, profiles, memory, skills,
  tools, schedules, messaging gateways, logs, backup, and diagnostics.

Use this project as our main desktop integration reference.

### Adopt

- Use the official Hermes installer as a runtime generation input rather than
  asking users to run it.
- Generate a bundled runtime with setup skipped, then complete provider setup
  through our GUI.
- Keep the standard Hermes home layout compatible with upstream:
  `~/.hermes`, `~/.hermes/.env`, `~/.hermes/config.yaml`,
  `~/.hermes/hermes-agent`, `~/.hermes/profiles`, `~/.hermes/state.db`, and
  `~/.hermes/cron/jobs.json`.
- Support local and remote backend modes.
- Default local API server: `http://127.0.0.1:8642`.
- Prefer OpenAI-compatible `/v1/chat/completions` with SSE streaming for chat.
- Send `X-Hermes-Session-Id` so fresh desktop sessions do not collide through
  gateway fingerprinting.
- Ensure gateway starts with `API_SERVER_ENABLED=true`.
- Auto-add an `api_server` platform block to `config.yaml` when missing.
- Show preparation, service, doctor, and debug output inside the GUI.
- Provide backup/import and diagnostic dump later.

### Avoid Copying Directly

- Electron-specific preload and IPC patterns.
- Very broad feature surface before our Tauri runtime path is stable.
- Visual assets and branding choices that do not match our simpler direction.
- Treating every power-user feature as MVP scope.

### Our Implementation Direction

- Use Tauri native commands instead of Electron main-process IPC.
- Keep a bundled app-owned runtime as the default mode.
- Use the official installer only from the runtime generation script, not from
  the normal product path.
- Surface local engine actions in Settings first:
  prepare, start, stop, status, diagnostics, portal setup.
- Rebuild the UI with our own Vercel/Linear/LobeHub-inspired minimal style.

## EKKOLearnAI/hermes-web-ui

Repository:

- [https://github.com/EKKOLearnAI/hermes-web-ui](https://github.com/EKKOLearnAI/hermes-web-ui)

Positioning:

- A full-featured web dashboard for Hermes Agent.
- It is the best reference for the complete Hermes management surface.

Use this project as our feature map reference.

### Adopt

- Chat with real-time streaming.
- Multi-session management.
- Session search.
- Tool-call detail expansion.
- Profile-scoped uploads and downloads.
- Platform channel configuration.
- Usage analytics.
- Scheduled jobs.
- Model/provider management.
- Multi-profile management.
- File browser.
- Group chat.
- Skills and memory browsing.
- Logs.
- Web terminal.
- Settings grouped by display, agent, memory, session, privacy, model, profile,
  and providers.

### Avoid Copying Directly

- Web server and localhost-first UX for normal desktop users.
- Login/user management as a default local desktop requirement.
- Exposing raw technical nouns too early, such as MCP, cron, endpoint, daemon,
  or toolset.
- Porting every page before the core local setup and chat loop is polished.

### Our Implementation Direction

- Use it to define v0.1, v0.2, and v0.3 feature scope.
- Reorganize features around user jobs rather than technical menus.
- Keep the first version focused on:
  onboarding, chat, sessions, tasks, jobs, models, files, settings, runtime.
- Add advanced Web UI surfaces later:
  profiles, channels, skills, memory, logs, usage, terminal, kanban, group chat,
  plugins, performance, skills usage.

## lobehub/lobehub

Repository:

- [https://github.com/lobehub/lobehub](https://github.com/lobehub/lobehub)

Positioning:

- A broader agent workspace that frames agents as the unit of work.
- It emphasizes hiring, scheduling, reporting, agent teams, collaboration,
  project/workspace structure, and editable personal memory.

Use this project as our agent workspace and product-feel reference.

### Adopt

- Treat agents and tasks as first-class operational objects, not only chats.
- Make scheduled agent work visible and understandable.
- Support the idea of an AI team over time, even if our MVP starts with one
  Hermes runtime.
- Make memory editable and transparent.
- Use approachable onboarding and empty states.
- Use gentle AI workspace warmth where it helps normal users feel less
  intimidated.
- Keep a clear structure for projects, workspaces, schedules, and reports as
  the product grows.

### Avoid Copying Directly

- Cloud-first assumptions that conflict with our local-first desktop product.
- Marketing-heavy pages or large decorative visuals inside the app.
- Over-building multi-agent/team features before local Hermes setup is solid.
- Making the product feel like another chat website instead of a native desktop
  control surface.

### Our Implementation Direction

- Borrow the mental model: agents do work while the user stays in charge.
- Use it to guide future pages:
  Tasks, Jobs, Reports, Memory, Agent/Profile, Project/Workspace.
- Borrow visual warmth only in targeted places:
  onboarding, chat welcome, empty states, profile/agent surfaces.
- Keep operational pages more Vercel/Linear-like:
  files, logs, jobs, models, settings, diagnostics.

## Product Synthesis

Ash should combine the references like this:

- `fathah/hermes-desktop`: how to integrate Hermes locally.
- `EKKOLearnAI/hermes-web-ui`: what Hermes management features exist.
- `lobehub/lobehub`: how agent work can feel organized, approachable, and
  ongoing.

Our product should not become a clone of any of them.

The product direction remains:

- local-first
- desktop-native
- simple and useful
- bundled Hermes runtime
- clean operational UI
- friendly where helpful
- transparent about memory, tasks, files, permissions, and costs
