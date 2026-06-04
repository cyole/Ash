# Hermes Runtime Bundles

Generate platform runtime archives here before building the Tauri app:

```bash
scripts/build-hermes-runtime.sh
```

On Windows:

```powershell
./scripts/build-hermes-runtime.ps1
```

The generated archives are ignored by git and should not be committed.

The default script output is a minimal desktop runtime: core Hermes CLI,
gateway/API, Python runtime, providers, plugins, skills, and required Python
dependencies. It omits development-only folders, dependency caches, Python
bytecode, and Node/browser/TUI assets. Runtime validation is enabled by default
and fails the build if known development-only content remains.

Expected archive names:

- `hermes-runtime-darwin-arm64.tar.gz`
- `hermes-runtime-darwin-x64.tar.gz`
- `hermes-runtime-windows-x64.tar.gz`
- `hermes-runtime-linux-x64.tar.gz`

Each archive should extract to either:

```txt
hermes-agent/
  hermes
  venv/
```

or directly to a directory that contains the same `hermes` / `venv` layout.

The runtime is unpacked on first launch into the app data directory. User-level
Hermes configuration is read only as an import source; the app writes its own
`hermes-home/config.yaml` and app-owned local API authentication in
`hermes-home/.env`.
