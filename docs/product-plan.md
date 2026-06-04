# Ash Product Plan

## Purpose

Build a local desktop client for Hermes Agent that is easier for normal users
than a web dashboard or CLI.

The reference product surface is
[EKKOLearnAI/hermes-web-ui](https://github.com/EKKOLearnAI/hermes-web-ui), which
already covers chat, sessions, scheduled jobs, channels, models, profiles,
files, skills, memory, logs, terminal, usage analytics, and settings.

The full reference set is documented in [Reference Projects](references.md):

- [fathah/hermes-desktop](https://github.com/fathah/hermes-desktop) for desktop
  Hermes integration.
- [EKKOLearnAI/hermes-web-ui](https://github.com/EKKOLearnAI/hermes-web-ui) for
  the Hermes feature surface.
- [lobehub/lobehub](https://github.com/lobehub/lobehub) for agent workspace
  structure and approachable AI product feel.

Our product should keep that control-center scope, but use Tauri's local
capabilities to remove setup friction:

- no manual `npm install`
- no manual localhost server startup
- no hand-editing `~/.hermes/.env` or `config.yaml`
- no unclear credential storage
- no invisible background process state

## Product Positioning

Ash is a local-first personal AI assistant control center.

It should feel closer to Tencent Marvis, OpenClaw companion apps, or a native
system assistant than to Cherry Studio or LobeHub. The user should not think:
"which model should I chat with?" They should think: "what do I want Hermes to
do for me?"

## Target Users

Primary users:

- normal users who want a personal AI assistant but do not want terminal setup
- power users who want Hermes running locally with visible controls
- creators, researchers, operators, and small teams using scheduled agent tasks

Secondary users:

- developers evaluating Hermes Agent
- self-hosters who want a local desktop controller for a remote Hermes runtime
- future users who may want OpenClaw or other agent backends through adapters

## Product Principles

- Simplicity wins: when visual polish conflicts with clarity or speed, choose
  clarity and speed.
- Usability first: every main screen should make the next useful action obvious.
- Local first: default to local data, local config, local logs, and system
  credential storage.
- User-readable safety: explain dangerous actions in plain language.
- Progressive disclosure: hide agent jargon until the user needs it.
- Runtime visibility: background tasks, current model, active profile, and
  connection health should always be inspectable.
- Adapter-ready: keep the UI independent from one Hermes transport so a future
  OpenClaw adapter is possible.
- Practical before magical: prioritize reliable chat, setup, files, jobs, and
  diagnostics before advanced multi-agent visualizations.

## Visual Direction

Use a Vercel + Linear inspired product style as the default direction, with
permission to borrow LobeHub's softer AI workspace feel where it helps the app
feel more approachable.

The shared baseline:

- simple, precise, and fast instead of playful or decorative
- monochrome-led surfaces with restrained accent colors
- thin borders, subtle dividers, and quiet shadows only where useful
- dense but readable desktop layouts
- sidebar-first navigation
- command-palette friendliness
- clear tables and lists for operational data
- drawers for detail inspection
- dialogs for destructive or security-sensitive decisions
- restrained motion, mostly for state changes and progress
- typography that feels like a serious tool, not a marketing site

The app should feel like a calm control surface for real work. Avoid the visual
language of AI landing pages.

The final standard is not whether it looks like Vercel, Linear, or LobeHub. The
final standard is whether it is simple, obvious, fast, and useful.

Style option A: Vercel + Linear inspired

- sharper and more operational
- more monochrome
- denser tables and lists
- ideal for logs, files, jobs, models, and settings
- best when we want the product to feel like serious infrastructure software

Style option B: LobeHub inspired

- softer and more approachable
- slightly more color and layered surfaces
- better for onboarding, chat, agent/profile presentation, and empty states
- useful if the product needs to feel less intimidating to normal users

Recommended decision:

- use Vercel + Linear as the structural base
- borrow LobeHub's warmth for onboarding, assistant/profile surfaces, empty
  states, and friendly guidance
- do not copy any brand directly; use these products as references for visual
  restraint, spacing discipline, hierarchy, and polish

## Reference Feature Map

The web UI reference includes these feature areas:

- Chat
- History
- Scheduled jobs
- Kanban
- Model management
- Profiles
- Logs
- Usage analytics
- Skills
- Plugins
- Memory
- Settings
- Channels
- Terminal
- Group chat
- Files
- Performance monitoring
- Skills usage analytics
- Authentication and user management

For the desktop product, these should be reorganized around user jobs rather
than technical menus.

## Desktop-Specific Differentiators

These are the reasons to build a native local app instead of only using the web
UI:

- bundled local engine preparation
- app-owned configuration import and repair
- start, stop, restart, and health-check the local engine
- background daemon management
- menu bar or tray controls
- native notifications for task completion, failure, or approval requests
- system Keychain or credential manager integration
- file picker, folder picker, and local permission prompts
- app auto-update
- crash recovery and diagnostic bundle export
- local-first onboarding
- safe handling of local file deletion, shell commands, and external app access

## Information Architecture

Recommended first-level navigation:

- Home
- Chat
- Sessions
- Tasks
- Jobs
- Files
- Models
- Settings

Recommended second-wave navigation:

- Profiles
- Channels
- Skills
- Memory
- Logs
- Usage
- Terminal

Recommended advanced navigation:

- Kanban
- Group Chat
- Plugins
- Performance
- Skills Usage

## MVP Scope

The MVP should prove that the local desktop app is easier than the web UI.

### 1. Onboarding

Goals:

- detect whether the bundled local engine is available
- detect whether the local engine is currently running
- default to local mode, with remote mode as an advanced option
- configure at least one model provider
- verify the connection before entering the app

User flow:

1. Welcome
2. Prepare the built-in local engine
3. Import existing Hermes preferences if present
4. Local mode checks runtime and service status
5. Model setup asks for provider and key, with local model option
6. Connection test
7. Enter Chat

MVP providers:

- OpenRouter
- OpenAI-compatible endpoint
- Anthropic
- Nous Portal if current Hermes support is stable enough
- Local OpenAI-compatible endpoint such as Ollama or LM Studio

### 2. Chat

Must have:

- streaming responses
- Markdown rendering
- code highlighting and copy button
- model selector
- profile selector, if profiles are present
- file upload
- generated file download
- visible tool-call progress
- expandable tool-call arguments and results
- stop current run
- retry last message
- start new session

Nice to have:

- slash command autocomplete
- drag-and-drop file upload
- compact mode
- session token usage badge

### 3. Sessions

Must have:

- list sessions
- create session
- rename session
- delete session
- switch session
- search local desktop sessions
- show source labels when available, such as CLI, Telegram, Discord, Slack

Important distinction:

- Web UI keeps its own SQLite session database.
- Desktop can also keep its own local app database, but should treat Hermes
  state as the source of truth when possible.

### 4. Tasks

The Tasks page is our local desktop interpretation of "agent runs".

Must have:

- running tasks
- completed tasks
- failed tasks
- waiting-for-approval tasks
- task detail drawer
- event timeline
- stop task
- rerun task if supported
- open related session

This page is important because normal users need to see what Hermes is doing
after they send a request.

### 5. Jobs

Must have:

- create scheduled task
- edit scheduled task
- pause and resume
- delete
- run now
- quick presets for every morning, every weekday, hourly, daily, weekly
- plain-language schedule summary

Avoid exposing raw cron as the default UI. Keep advanced cron editing available
behind an "Advanced" section.

### 6. Models

Must have:

- list providers
- add provider
- edit provider
- delete provider
- set default provider and model
- fetch models from provider endpoint
- mark missing or invalid credentials
- save secrets to system credential storage when possible

Plain-language labels:

- "Model service" instead of "Provider"
- "Service address" instead of "Endpoint"
- "Default model" instead of "model config"

### 7. Files

Must have:

- local profile upload folder
- browse files
- preview text, Markdown, JSON, and code files
- upload
- download
- rename
- move
- copy
- delete with confirmation
- open in Finder or system file manager

Advanced backends like Docker, SSH, and Singularity can come after the local
file path is polished.

### 8. Settings

Must have:

- local engine status
- bundled runtime archive status
- local/remote mode
- local server status
- app theme
- startup behavior
- notification preferences
- privacy mode
- diagnostic export
- reset app data
- logs directory shortcut

Security settings:

- require confirmation before shell commands
- require confirmation before deleting files
- require confirmation before sending messages through external channels
- restrict file access to selected folders when possible

## v0.2 Scope

### Profiles

- create profile
- rename profile
- clone profile
- import and export profile archive
- switch profile
- show profile-specific config, uploads, jobs, memory, skills, and models

### Channels

Mirror the web UI's first set of messaging channels:

- Telegram
- Discord
- Slack
- WhatsApp
- Matrix
- Feishu/Lark
- WeChat
- WeCom

Desktop-specific improvements:

- QR login windows should be native and clearly scoped
- channel status should show configured, running, failed, and needs attention
- credentials should be stored safely or written only through Hermes when
  required

### Skills

- list installed skills
- search skills
- view skill details
- view attached files
- enable or disable if Hermes exposes that capability

### Memory

- view user profile memory
- edit notes
- search memory
- explain which profile the memory belongs to
- show last updated time

### Logs

- agent logs
- app logs
- bridge logs
- error logs
- filter by level
- filter by keyword
- copy selected log lines
- export diagnostic bundle

### Usage

- total input and output tokens
- estimated cost
- model distribution
- daily trend
- cache hit rate if available

### Terminal

- local PTY session
- multiple terminal tabs
- resize support
- close session
- warning when a terminal command may affect local files

## v0.3 Scope

### Kanban

- task board for long-running and multi-agent work
- task cards
- columns for backlog, running, waiting, done, failed
- task detail drawer
- links to related session, job, file, or log

### Group Chat

- create room
- invite agents
- mention routing
- typing and progress indicators
- context compression status
- room history

### Plugins

- list installed plugins
- plugin details
- plugin status
- install or remove if Hermes exposes stable plugin APIs

### Performance

- runtime health
- response latency
- model error rate
- task failure reasons
- local process CPU and memory usage

### Skills Usage

- most-used skills
- failed skills
- recent skill updates
- skill-generated artifacts

## Authentication Decision

The web UI includes token auth, username/password login, account management, and
profile binding. The desktop MVP should not copy this by default.

Recommended MVP behavior:

- no login for local single-user desktop mode
- optional app lock later
- remote mode can store a remote API token
- team mode can be planned separately

Reason:

- a local desktop app already runs in the user's OS account
- login screens add friction and do not solve local machine security by
  themselves
- secrets should be protected by the OS credential manager

## Safety Model

High-risk actions should be visible and confirmable:

- shell command execution
- file deletion or overwrite
- writing outside the configured workspace
- sending messages through external accounts
- accessing browser sessions
- changing system settings
- creating recurring jobs
- using remote Hermes backends

Approval UI should answer:

- what Hermes wants to do
- why it wants to do it
- which files, apps, account, or service are involved
- whether the permission is one-time or persistent

Approval options:

- allow once
- allow for this session
- always allow for this folder or service
- deny

## Milestones

### Milestone 1: Project Shell

Deliverables:

- Tauri app opens on macOS, Windows, and Linux dev environments
- React router and base layout
- shadcn/ui installed
- light and dark theme
- sidebar navigation
- app settings store
- initial Tauri commands wired to the frontend

Done when:

- `pnpm tauri dev` opens the desktop app
- Home, Chat, Models, Files, Settings placeholder pages exist

### Milestone 2: Local Engine Preparation

Deliverables:

- detect bundled runtime archive availability
- unpack the bundled runtime into app data
- create app-owned `hermes-home`
- import existing user Hermes config once
- detect local API status if available
- show health status in sidebar
- start and stop local process when supported
- open logs folder

Done when:

- a user can prepare and run the local engine without terminal use

### Milestone 3: Onboarding and Model Setup

Deliverables:

- built-in local engine setup
- optional remote mode selection
- provider setup
- credential save path
- connection test
- friendly error states

Done when:

- a new user can get from first launch to a working connection

### Milestone 4: Chat and Sessions

Deliverables:

- streaming chat
- session list
- create/rename/delete/switch sessions
- Markdown and code rendering
- tool call display
- stop and retry
- file upload and download

Done when:

- a user can complete a real Hermes chat workflow from the app

### Milestone 5: Tasks and Jobs

Deliverables:

- task list
- task status timeline
- failed task details
- approval status
- scheduled job CRUD
- run now, pause, resume

Done when:

- a user can create and monitor at least one scheduled Hermes task

### Milestone 6: Files and Diagnostics

Deliverables:

- file browser
- file preview
- upload/download
- destructive action confirmation
- logs page
- diagnostic export

Done when:

- a user can inspect files and send a useful debug bundle after failure

### Milestone 7: First Alpha

Deliverables:

- packaged app
- basic auto-update plan
- install instructions
- known limitations
- smoke tests

Done when:

- a non-developer can install the alpha and run a basic Hermes workflow

## Suggested Timeline

Assuming one focused developer:

- Week 1: project shell and design system
- Week 2: bundled runtime preparation and onboarding
- Week 3: chat, streaming, sessions
- Week 4: models, settings, credential storage
- Week 5: tasks, jobs, files
- Week 6: logs, diagnostics, packaging, alpha polish

If we decide to copy more Web UI feature depth in v0.1, expect 8 to 10 weeks.

## Open Questions

- Does Hermes Agent expose a stable local HTTP API, or do we need a bridge first?
- What packaging process gives us a relocatable Hermes runtime per OS/arch?
- Which OS should be the first-class development target?
- Should advanced web UI features be embedded through a local server temporarily
  or rebuilt natively in React?
- What is the default safe workspace folder?
- Do we want a mobile companion later, or only desktop for now?
