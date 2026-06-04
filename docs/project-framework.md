# Ash Project Framework

## Recommended Stack

Use:

- Tauri 2
- React
- TypeScript
- TailwindCSS
- shadcn/ui
- Vite
- Rust for native desktop commands

Recommended frontend libraries:

- `@tanstack/react-query` for server state
- `zustand` for small app-level state
- `react-router` for routing
- `react-hook-form` and `zod` for forms and validation
- `lucide-react` for icons
- `sonner` for toasts
- `react-markdown` for Markdown rendering
- `shiki` or `highlight.js` for code highlighting
- `recharts` for usage charts
- `@xterm/xterm` for terminal UI when terminal support starts

Recommended Tauri plugins:

- shell/process plugin for controlled command execution
- dialog plugin for file and folder pickers
- notification plugin
- store plugin for non-secret preferences
- updater plugin
- opener plugin
- clipboard plugin
- OS-specific keychain integration for secrets

## Repository Layout

Recommended initial layout:

```txt
Ash/
  README.md
  docs/
    product-plan.md
    project-framework.md
  src/
    app/
      App.tsx
      router.tsx
      providers.tsx
    components/
      app/
      chat/
      files/
      jobs/
      layout/
      models/
      settings/
      tasks/
      ui/
    features/
      onboarding/
      chat/
      sessions/
      tasks/
      jobs/
      models/
      files/
      settings/
      runtime/
    lib/
      api/
      hermes/
      stores/
      utils/
      validation/
    styles/
      globals.css
    types/
      runtime.ts
      events.ts
      settings.ts
  src-tauri/
    capabilities/
    icons/
    src/
      main.rs
      commands/
        runtime.rs
        process.rs
        config.rs
        credentials.rs
        files.rs
        logs.rs
        diagnostics.rs
      hermes/
        discovery.rs
        bundler.rs
        process_manager.rs
        config.rs
        paths.rs
      security/
        approvals.rs
        keychain.rs
      state/
        app_state.rs
      lib.rs
    tauri.conf.json
```

## Feature Module Pattern

Each feature should own its page, components, hooks, and API binding.

Example:

```txt
src/features/chat/
  ChatPage.tsx
  components/
    ChatInput.tsx
    MessageList.tsx
    MessageItem.tsx
    ToolCallCard.tsx
    FileAttachmentBar.tsx
  hooks/
    useChatStream.ts
    useSessionMessages.ts
  api.ts
  types.ts
```

This avoids a giant shared components folder and makes it easier to move feature
boundaries later.

## Suggested Routes

MVP routes:

```txt
/onboarding
/
/chat
/sessions
/tasks
/jobs
/files
/models
/settings
```

v0.2 routes:

```txt
/profiles
/channels
/skills
/memory
/logs
/usage
/terminal
```

v0.3 routes:

```txt
/kanban
/group-chat
/plugins
/performance
/skills-usage
```

## App Shell

The app shell should include:

- left sidebar
- top profile/model status bar
- global command/search shortcut
- runtime connection status
- task status indicator
- notification center entry
- settings shortcut

Avoid a marketing-style home screen. The first screen should help users run or
inspect the local runtime immediately.

## Backend Adapter Layer

The React UI should never call a concrete runtime transport directly.

Use a backend adapter interface:

```ts
export interface RuntimeBackend {
  getStatus(): Promise<RuntimeStatus>;
  sendMessage(input: ChatInput): AsyncIterable<ChatEvent>;
  stopRun(runId: string): Promise<void>;
  listSessions(): Promise<SessionSummary[]>;
  getSession(sessionId: string): Promise<SessionDetail>;
  listTasks(): Promise<TaskSummary[]>;
  listJobs(): Promise<JobSummary[]>;
  listModels(): Promise<ModelSummary[]>;
  listProfiles(): Promise<ProfileSummary[]>;
}
```

Initial adapters:

- `LocalRuntimeBackend`
- `RemoteRuntimeBackend`
- `CliBridgeRuntimeBackend`

Future adapters:

- `OpenClawBackend`
- `MockRuntimeBackend` for development and tests

## Tauri Command Boundary

Frontend calls Tauri commands for native actions only:

- runtime detection
- process control
- filesystem operations
- credential storage
- notifications
- diagnostics
- updater

Agent protocol calls should stay in TypeScript when possible, unless they need
native OS access.

Example command groups:

```rust
runtime_status()
runtime_prepare()
runtime_start()
runtime_stop()
runtime_restart()

credentials_set()
credentials_get()
credentials_delete()

files_list()
files_read_preview()
files_upload()
files_download()
files_delete()

logs_list()
logs_read()
diagnostics_export()
```

## Data Storage

Use three storage classes:

### App Preferences

Use Tauri store or a small local database for:

- theme
- sidebar state
- selected profile
- selected model
- onboarding completed
- local/remote mode
- app window preferences

### Secrets

Use OS credential storage for:

- provider API keys
- remote Hermes token
- OAuth tokens when possible

Do not store secrets in localStorage.

### App Database

Use SQLite only when needed for:

- local desktop session cache
- task event cache
- recent files
- diagnostics metadata
- usage snapshots

Prefer reading from Hermes state when Hermes already owns the data.

## Runtime Strategy

Support three modes:

### Bundled Local

The app unpacks a bundled Hermes runtime, starts, stops, and monitors it.

This is the primary user-friendly path.

### Remote

The app connects to a remote Hermes API server with URL and token.

This is useful for VPS and home-server setups.

## Process Management

The native layer should own process lifecycle:

- find app-owned Agent runtime
- unpack bundled runtime archive
- validate version
- start service
- stop service
- restart service
- read PID
- detect port conflicts
- stream logs

The frontend should only display state and request lifecycle operations.

## Security and Permissions

Implement a first-class approval model early.

Approval categories:

- file read
- file write
- file delete
- shell command
- browser action
- external message send
- scheduled job creation
- system setting change
- remote backend connection

Approval states:

- pending
- allowed once
- allowed for session
- always allowed for scope
- denied

The UI should use plain-language summaries and show exact paths, apps, services,
or command previews.

## UI System

Use shadcn/ui as the base. The visual system should sit between Vercel +
Linear's crisp tool style and LobeHub's approachable AI workspace style.

North star:

- simple over clever
- useful over impressive
- obvious over novel
- fast over decorative
- fewer controls until the user needs more

Design direction:

- neutral-first palette
- white, near-black, zinc, neutral, and slate tones
- one restrained accent color for selected state and primary actions
- high contrast text, low contrast chrome
- 1px borders as the main separator
- minimal shadows
- crisp 6px to 8px radius
- compact spacing
- stable row heights
- keyboard-first interactions
- no decorative AI artwork

Use the Vercel + Linear side for:

- navigation
- settings
- files
- logs
- jobs
- models
- tables
- command palette

Use the LobeHub side for:

- onboarding
- empty states
- chat welcome state
- agent/profile presentation
- friendly helper copy
- subtle icon treatments

The blend should still feel like one product: crisp structure, slightly warm
details.

Core layout patterns:

- compact sidebar
- dense but readable lists
- tables for jobs, files, logs, and models
- drawers for details
- dialogs for destructive actions
- tabs for settings groups
- badges for status
- tooltips for icon-only controls
- command palette for fast navigation and actions

Recommended density:

- sidebar item height: 32px to 36px
- table row height: 36px to 44px
- toolbar height: 40px
- primary content max width only when reading prose; operational pages should
  use the available desktop width
- cards only for repeated entities or focused panels, not for every page

Recommended status colors:

- neutral for idle and default states
- blue or violet sparingly for active work
- amber for waiting or needs attention
- red for destructive, failed, or unsafe actions
- green only for completed or healthy states

Avoid:

- marketing hero pages
- oversized cards
- decorative gradients
- nested cards
- vague AI-themed illustrations
- one-note colorful palettes
- large empty whitespace that makes operational pages harder to scan
- rounded pill buttons for ordinary commands when an icon button or compact
  button works better

Suggested Tailwind theme direction:

```ts
// Keep this as a direction, not final tokens.
colors: {
  background: "hsl(0 0% 100%)",
  foreground: "hsl(240 10% 3.9%)",
  muted: "hsl(240 4.8% 95.9%)",
  mutedForeground: "hsl(240 3.8% 46.1%)",
  border: "hsl(240 5.9% 90%)",
  accent: "hsl(240 4.8% 95.9%)",
  primary: "hsl(240 5.9% 10%)",
  destructive: "hsl(0 72% 51%)",
}
borderRadius: {
  sm: "4px",
  md: "6px",
  lg: "8px",
}
```

Optional softer LobeHub-inspired adjustments:

- use a subtle tinted accent background for selected navigation items
- allow very light panel backgrounds for onboarding and empty states
- use small color accents on provider, model, and profile badges
- keep page backgrounds neutral and avoid full-page gradients
- keep cards shallow and functional, not decorative

## Suggested shadcn Components

Install early:

```txt
button
input
textarea
select
dialog
drawer
sheet
dropdown-menu
tabs
table
badge
alert
toast/sonner
tooltip
scroll-area
separator
switch
checkbox
radio-group
form
command
popover
progress
skeleton
```

## Development Bootstrap

Recommended package manager: `pnpm`.

Initial commands:

```bash
pnpm create tauri-app@latest .
pnpm add @tanstack/react-query zustand react-router react-hook-form zod lucide-react sonner react-markdown recharts
pnpm add -D tailwindcss @tailwindcss/vite
pnpm dlx shadcn@latest init
```

Then add Tauri plugins as needed.

## Testing Strategy

Unit tests:

- adapter event parsing
- stream parsing
- form validation
- settings reducers
- schedule summary formatting

Integration tests:

- mock runtime backend
- onboarding flow
- chat flow with streaming events
- jobs CRUD
- file delete confirmation

Desktop smoke tests:

- app starts
- onboarding appears
- settings persist
- runtime detection handles missing runtime
- remote connection validation fails gracefully

Use Playwright for frontend flows where practical. Add Rust tests for native
path discovery and config parsing.

## Packaging Strategy

Targets:

- macOS Apple Silicon
- macOS Intel if needed
- Windows x64
- Linux AppImage or deb after macOS/Windows are stable

Release requirements:

- signed builds eventually
- auto-update channel
- clear version display
- diagnostic export
- migration notes for config changes

## Recommended First Implementation Order

1. Create Tauri app shell
2. Add Tailwind and shadcn
3. Build layout and placeholder routes
4. Add app state and settings persistence
5. Add runtime detection Tauri commands
6. Build onboarding
7. Add local/remote backend adapter interface
8. Implement mock backend
9. Implement chat UI against mock backend
10. Connect real Hermes chat stream
11. Add sessions
12. Add models
13. Add jobs
14. Add files
15. Add logs and diagnostic export

The mock backend is important because it lets us build the desktop UI before the
Hermes Agent API boundary is fully stable.
