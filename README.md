# Hermes

Hermes is a local-first desktop client for Hermes Agent.

The first product goal is to make Hermes usable for normal people without
asking them to manage terminals, local servers, credentials, or config files by
hand.

## Docs

- [Product Plan](docs/product-plan.md)
- [Project Framework](docs/project-framework.md)
- [Hermes Agent Integration](docs/hermes-integration.md)
- [Runtime Bundling](docs/runtime-bundling.md)
- [Reference Projects](docs/references.md)

## Development

```bash
pnpm install
pnpm dev
pnpm tauri:dev
```

Validation:

```bash
pnpm build
cd src-tauri && cargo check
```

## Working Positioning

Hermes Desktop is not another chat UI. It is a local assistant workspace for:

- preparing a built-in local engine
- chatting with streaming task progress
- managing sessions, models, files, jobs, skills, memory, and logs
- keeping credentials and local permissions understandable and safe

The visual direction can sit between Vercel + Linear and LobeHub: minimal,
fast, clean, slightly warm, and still tool-like.
