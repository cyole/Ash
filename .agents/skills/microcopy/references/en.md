---
globs: src/**/*.tsx,src/**/*.ts
alwaysApply: false
---

# English Microcopy Reference

This is a local-first assistant workspace. English copy should feel clear, calm, and controllable: closer to a desktop productivity tool than a marketing surface.

## Fixed Terms

- Agent process: runtime
- Local API/gateway: local service
- Conversation container: session
- Long-running agent work: run
- Tool/use progress: trace
- Provider credentials: provider key
- App-owned config: app-managed config
- Native app bridge: desktop runtime

Use one term per concept. Do not alternate between runtime, daemon, server, and process unless the distinction matters.

## Voice

- Short sentences.
- Strong verbs.
- Minimal adjectives.
- Warmth through clarity, not cheerleading.
- Never imply the user needs to understand terminal output, config files, or runtime internals to keep going.

## Action Labels

Prefer verb + object:

- Start runtime
- Stop run
- Retry
- View details
- Open diagnostics
- Copy logs
- Add provider key
- Remove key
- Delete session

Avoid vague labels when the outcome is not obvious:

- OK
- Submit
- Confirm
- Continue

## Empty States

Good shape:

```text
Start a session
Describe what you want to do.
```

```text
No provider keys yet
Add a key to run the local runtime with your preferred model provider.
```

## Waiting and Progress

```text
Still working. You can leave this view and come back.
```

```text
Preparing the runtime...
This can take a minute the first time.
```

## Errors

Every error needs:

1. What happened.
2. What the user can do next.
3. Where technical details live, if useful.

Examples:

```text
The local service is not running.
Start the local service, or open diagnostics for details.
```

```text
That did not run through.
Retry, or view details to see what failed.
```

```text
Provider key was not saved.
Check the key and try again. Your existing keys were not changed.
```

## Security and Permissions

Be precise and neutral:

```text
Allow folder access
The app needs this folder only for files you choose in this run.
```

```text
Keys are stored locally and used only by this runtime.
```

Do not put raw secrets, headers, tokens, or full paths in routine UI copy. Put technical detail in diagnostics when needed.
