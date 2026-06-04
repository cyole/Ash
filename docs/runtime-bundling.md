# Runtime Bundling

## Product Decision

Hermes Desktop should ship a built-in local engine instead of asking normal
users to install Hermes from a terminal.

Default user flow:

1. App starts.
2. App unpacks the bundled runtime into its private app data directory.
3. App creates its own `hermes-home`.
4. App reads an existing user Hermes config only as an import source.
5. App writes its own merged config and forces the local API server settings.
6. App starts the local service automatically.
7. App stops the local service before normal shutdown.

Users should not need to understand Hermes CLI, Python, virtual environments,
ports, or gateway processes.

## Runtime Ownership

The app owns these paths:

```txt
<AppData>/runtime/hermes-agent
<AppData>/runtime/runtime-manifest.json
<AppData>/hermes-home/config.yaml
```

The app may read, but must not modify:

```txt
~/.hermes/config.yaml
```

On Windows the legacy user config source is:

```txt
%LOCALAPPDATA%\hermes\config.yaml
```

## Bundle Format

Runtime archives live in:

```txt
src-tauri/resources/hermes-runtime/
```

Expected archive names:

```txt
hermes-runtime-darwin-arm64.tar.gz
hermes-runtime-darwin-x64.tar.gz
hermes-runtime-windows-x64.tar.gz
hermes-runtime-linux-x64.tar.gz
```

Generated archives are intentionally ignored by git. Each developer or release
job should generate the archive locally for the target platform.

Each archive should extract to:

```txt
hermes-agent/
  hermes
  venv/
```

or directly to a directory with an equivalent `hermes` / `venv` layout.

Important: the packaged runtime must be relocatable. A raw virtual environment
created in a temporary folder may contain absolute interpreter paths. The final
runtime build should include a launcher that resolves paths relative to its own
directory, or a packaging process that rewrites launcher paths for the app data
install directory.

## Runtime Lifecycle

The normal product path is owned by the Tauri app lifecycle:

```txt
app startup -> runtime_prepare()
app shutdown -> runtime_gateway_stop()
```

It performs:

1. Create app-owned runtime directories.
2. Import eligible keys from the user's existing Hermes config.
3. Unpack the bundled runtime archive if the app runtime is missing.
4. Write app-controlled local API settings.
5. Ensure an app-owned `API_SERVER_KEY` exists in `<AppData>/hermes-home/.env`.
6. Start the Hermes gateway/API service, or restart it if the gateway is
   already running but the local API health check is failing.

Normal onboarding and settings should not expose manual runtime controls.
Manual prepare/start/stop/doctor commands live behind the developer debug menu
only, and Tauri runs those commands on blocking worker threads so service
operations do not freeze the UI.

## Config Merge Rules

Migrated user keys are intentionally whitelisted:

```txt
accounts
auth
channels
credentials
memory
models
portal
preferences
profiles
providers
settings
skills
tools
platforms except api_server
```

The app always controls:

```txt
platforms.api_server.enabled
platforms.api_server.extra.host
platforms.api_server.extra.port
API_SERVER_KEY in <AppData>/hermes-home/.env
runtime paths
gateway start/stop
logs and diagnostics
```

## Runtime Generation Script

Generate the current platform runtime archive with:

```bash
scripts/build-hermes-runtime.sh
```

On Windows, use PowerShell:

```powershell
./scripts/build-hermes-runtime.ps1
```

By default the script builds a minimal desktop runtime from the pinned Hermes
Agent tag used by this app. It skips Node/browser tool installation and
prunes development-only content such as `.git`, tests, website/web source, TUI
assets, Docker/Nix packaging, caches, and `node_modules`.

Useful overrides:

```bash
HERMES_AGENT_REF=v2026.5.16 scripts/build-hermes-runtime.sh
HERMES_AGENT_REF=v2026.5.7 scripts/build-hermes-runtime.sh
HERMES_AGENT_COMMIT=<commit-sha> scripts/build-hermes-runtime.sh
HERMES_RUNTIME_KEEP_BUILD=1 scripts/build-hermes-runtime.sh
HERMES_RUNTIME_OUT_DIR=/tmp/hermes-runtime scripts/build-hermes-runtime.sh
HERMES_RUNTIME_INCLUDE_NODE_TOOLS=1 scripts/build-hermes-runtime.sh
HERMES_RUNTIME_PRUNE=0 scripts/build-hermes-runtime.sh
HERMES_RUNTIME_VALIDATE=0 scripts/build-hermes-runtime.sh
```

The PowerShell script accepts the same release pinning variables through the
environment, including `HERMES_AGENT_REF`, `HERMES_AGENT_COMMIT`,
`HERMES_RUNTIME_KEEP_BUILD`, `HERMES_RUNTIME_OUT_DIR`, and
`HERMES_RUNTIME_VALIDATE`.

The scripts use the official Hermes installer as a build-time tool in a
temporary directory, rewrite the generated Python environment so it can be
relocated after Tauri unpacks it, and write the archive under
`src-tauri/resources/hermes-runtime/`.

The default `HERMES_AGENT_REF` should be a Hermes release tag such as
`v2026.5.16`. `HERMES_AGENT_COMMIT` is optional and can be supplied by release
CI when we want an additional exact commit check for the tag checkout.

Runtime validation is enabled by default. It fails the build if known
development-only paths, dependency caches, or Python bytecode files remain in
the staged runtime.

The generated archive is not committed.

## Single-Binary Packaging

The current release path should remain a relocatable bundled runtime rather
than a single native executable.

A single Hermes binary is possible in principle with tools such as PyInstaller,
Nuitka, or PyOxidizer, but Hermes is a Python agent runtime with dynamic
providers, plugins, skills, optional extras, gateway adapters, native wheels,
and lazy-installed dependencies. Freezing that into one executable would make
startup, upgrades, platform-specific native dependencies, and plugin discovery
harder to verify than the current app-owned runtime directory.

If we explore this later, treat it as a separate packaging track:

1. Build a standalone `hermes` executable for one platform first.
2. Run the same gateway, API server, provider, plugin, and skill smoke tests.
3. Keep the Tauri integration boundary unchanged.
4. Replace only the `hermes-agent/venv` layout after the binary proves smaller,
   faster, and easier to update.

## Current Implementation Status

Implemented:

- app-owned runtime and `hermes-home` paths
- first-run config import from existing Hermes config
- bundled `.tar.gz` archive lookup through Tauri resources
- first-run unpack into app data
- local API server config enforcement
- app startup auto-start and shutdown stop hooks
- blocking runtime commands moved off the UI thread
- Hermes CLI command timeout handling
- API health check instead of raw port-only status
- pinned runtime generation default and staged runtime validation
- user-facing Settings copy that says "local engine" by default
- local runtime generation script
- developer-only debug menu for manual runtime commands and logs

Still needed:

- add build CI that packages and signs those archives
- add runtime upgrade and rollback behavior
- add progress events for long unpack/start operations
