# Hermes Agent Integration

## Recommended Direction

Integrate Hermes Agent as a bundled, app-owned local runtime.

The desktop app should not assume that users already installed Hermes. It should
own the runtime lifecycle:

- unpack a bundled Hermes runtime when missing
- keep the runtime under the app data directory
- create an app-owned `hermes-home`
- read an existing user Hermes config only as a first-run import source
- start and stop the gateway
- check health
- connect to the local API server
- show logs and diagnostics
- upgrade the bundled runtime later

This gives normal users the feeling that Hermes is built into the app, while
keeping a clean boundary between the Tauri desktop shell and the Python-based
Hermes runtime.

See [Runtime Bundling](runtime-bundling.md) for the concrete archive layout,
config merge rules, and current implementation status.

## Reference: fathah/hermes-desktop

[fathah/hermes-desktop](https://github.com/fathah/hermes-desktop) is a useful
reference because it has already explored many desktop integration edges.

See [Reference Projects](references.md) for the full reference set, including
[EKKOLearnAI/hermes-web-ui](https://github.com/EKKOLearnAI/hermes-web-ui) and
[lobehub/lobehub](https://github.com/lobehub/lobehub).

Takeaways we should adopt:

- use the official Hermes installer only inside our runtime generation script,
  not inside the product
- run the generation script with setup skipped, then finish provider setup in
  our GUI
- keep the app-owned Hermes home layout compatible with upstream while storing
  it under app data:
  `<AppData>/hermes-home/.env`, `<AppData>/hermes-home/config.yaml`,
  `<AppData>/hermes-home/profiles`, `<AppData>/hermes-home/state.db`, and
  `<AppData>/hermes-home/cron/jobs.json`
- support both local and remote backend modes
- use `http://127.0.0.1:8642` as the default local API server
- chat through `/v1/chat/completions` with SSE streaming
- send `X-Hermes-Session-Id` to avoid session collisions
- ensure the gateway has `API_SERVER_ENABLED=true`
- auto-add an `api_server` platform block to `config.yaml` when missing
- generate an app-owned `API_SERVER_KEY` in `<AppData>/hermes-home/.env`
- keep preparation/service/doctor logs visible in the GUI

Things we should not copy directly:

- Electron-specific preload/IPC patterns
- broad feature surface before the Tauri runtime path is stable
- decorative assets that do not match our simpler Vercel/Linear/LobeHub
  direction

## Why Not Import Hermes Directly into React or Rust?

Hermes Agent is a Python agent runtime with CLI, gateway, scheduler, tools,
skills, memory, terminal backends, and provider integrations. Importing it
directly into the Tauri/Rust process would make packaging, Python dependency
resolution, updates, and crash isolation much harder.

Use a process and HTTP boundary instead:

```txt
React UI
  -> TypeScript HermesApiClient
  -> Tauri native runtime manager
  -> Hermes gateway process
  -> Hermes API server on localhost
```

The app still feels integrated because users never see the terminal or install
steps unless they open diagnostics.

## Hermes Runtime Facts

Current Hermes Agent integration points we should design around:

- official installer exists for Linux, macOS, WSL2, Termux, and native Windows
  beta
- primary CLI commands include `hermes`, `hermes model`, `hermes tools`,
  `hermes config set`, `hermes gateway`, `hermes setup`, `hermes update`, and
  `hermes doctor`
- the gateway is the long-running process for messaging, scheduled jobs, and
  platform adapters
- gateway commands include `hermes gateway`, `hermes gateway setup`,
  `hermes gateway install`, `hermes gateway start`, `hermes gateway stop`, and
  `hermes gateway status`
- the API server adapter exposes an OpenAI-compatible API on
  `http://localhost:8642/v1` when enabled
- API server endpoints include health checks, models, sessions, session chat,
  runs, run event streams, approvals, and stop

## Integration Modes

### Mode 1: Bundled Runtime

This is the default product mode.

The app ships a pinned Hermes runtime bundle, unpacks it into an app-controlled
directory, and uses an app-owned `hermes-home`.

Recommended for MVP:

- package a relocatable Hermes runtime archive per OS/arch
- unpack the archive from Tauri resources into app data
- import existing user Hermes config once
- write app-controlled local API server settings
- start the Hermes gateway automatically through Hermes CLI/service commands
- stop the app-owned gateway during normal app shutdown
- connect to `http://127.0.0.1:8642`
- keep manual management visible only in the developer debug menu

Pros:

- best first-run user experience
- no terminal requirement
- no first-run network dependency
- predictable runtime version
- normal users do not need the terminal

Cons:

- larger app size
- runtime archives must be built per OS/arch
- Python runtime relocation must be handled carefully
- security updates become our responsibility

### Mode 2: Remote Hermes

The app connects to a remote Hermes server.

Required settings:

- server URL
- API token
- optional profile/session scope

This is useful for VPS, home-server, or team setups.

## MVP Technical Plan

### 1. Runtime Detection

Tauri command:

```txt
runtime_status()
```

Should detect:

- app-managed runtime location
- bundled runtime archive availability
- app-owned config path
- previous user Hermes config availability
- local API health on `127.0.0.1:8642`
- version via `hermes --version`
- gateway service status if available

### 2. Runtime Preparation

Tauri command:

```txt
runtime_prepare()
```

Suggested behavior:

- create app-owned runtime directories
- unpack `src-tauri/resources/hermes-runtime/hermes-runtime-<os>-<arch>.tar.gz`
- import whitelisted user config keys from an existing Hermes install
- enforce the app-controlled API server block
- start the local service
- show preparation logs in the app
- never modify the user's original `~/.hermes`

The app should not expose an installer command. Runtime archives are generated
outside the product by `scripts/build-hermes-runtime.sh`.

### 3. Gateway Management

Tauri commands:

```txt
runtime_gateway_status()
runtime_gateway_start()
runtime_gateway_stop()
runtime_gateway_restart()
```

Use official Hermes commands where possible:

```bash
hermes gateway status
hermes gateway start
hermes gateway stop
```

For development, foreground mode can be useful:

```bash
hermes gateway
```

### 4. API Server Connection

Frontend talks to Hermes API through `HermesApiClient`.

Base URL:

```txt
http://127.0.0.1:8642
```

Important endpoints:

```txt
GET  /health
GET  /health/detailed
GET  /v1/models
GET  /v1/capabilities
GET  /api/sessions
POST /api/sessions
GET  /api/sessions/:sessionId/messages
POST /api/sessions/:sessionId/chat/stream
POST /v1/runs
GET  /v1/runs/:runId
GET  /v1/runs/:runId/events
POST /v1/runs/:runId/approval
POST /v1/runs/:runId/stop
```

### 5. Configuration

The app should write config only through a controlled layer.

Paths to support:

- `~/.hermes/.env`
- `~/.hermes/config.yaml`
- `~/.hermes/gateway.json`
- app-specific preferences in Tauri store or SQLite
- provider secrets in OS credential storage where possible

Avoid writing secrets to frontend storage.

### 6. UI Flow

First launch:

1. Check for bundled runtime archive
2. Unpack runtime into app data if missing
3. Create app-owned `hermes-home`
4. Import existing user Hermes config when present
5. Ask for model service setup only if needed
6. Enable API server/gateway in the app-owned config
7. Generate app-owned local API authentication if missing
8. Start or restart the local service
9. Open Chat

Existing install:

1. Detect app-owned runtime
2. Check service/API health
3. If stopped, auto-start in the background
4. If config missing, recreate app-owned config from defaults/imports

Remote mode:

1. Ask for URL and token
2. Call `/health`
3. Save token to credential storage
4. Open Chat

## Repository Structure Additions

Recommended additions:

```txt
src/lib/hermes/
  api.ts
  backend.ts
  types.ts

src-tauri/src/hermes/
  discovery.rs
  bundler.rs
  gateway.rs
  paths.rs
  process_manager.rs

src-tauri/src/commands/
  runtime.rs
  hermes_config.rs
  gateway.rs
```

## Integration Contract

The UI should depend on this app-level contract, not raw endpoints:

```ts
export interface HermesBackend {
  health(): Promise<HermesHealth>;
  listModels(): Promise<HermesModel[]>;
  listSessions(): Promise<HermesSession[]>;
  createSession(input?: CreateSessionInput): Promise<HermesSession>;
  listSessionMessages(sessionId: string): Promise<HermesMessage[]>;
  streamSessionChat(input: SessionChatInput): AsyncIterable<HermesStreamEvent>;
  startRun(input: StartRunInput): Promise<HermesRun>;
  stopRun(runId: string): Promise<void>;
  approveRun(input: ApprovalInput): Promise<void>;
}
```

This keeps the app ready for:

- local Hermes
- remote Hermes
- future OpenClaw adapter
- mock backend for UI tests

## Packaging Decision

Recommended sequence:

1. Build MVP around Bundled Runtime mode.
2. Use the Hermes CLI/API server boundary and manage it from Tauri.
3. Keep online install as an advanced repair fallback.
4. Only then consider freezing Hermes into a single binary per OS.

Do not rely on the user's global Hermes install for the normal product path.
