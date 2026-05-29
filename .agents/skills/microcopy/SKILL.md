---
name: microcopy
description: "UI copy and microcopy guide - labels, buttons, empty states, errors, onboarding, runtime status, chat streaming, settings, diagnostics, and English/Chinese wording. Use when writing or editing user-facing copy. Triggers on 'copy', 'microcopy', 'empty state', 'error message', 'button label', 'toast', 'translation', 'Chinese copy', 'English copy'."
user-invocable: false
---

# UI Microcopy Guidelines

This is a local-first assistant workspace. Copy should make local runtime work feel understandable, calm, and controllable.

For fuller language guidance, load the matching reference only when needed:

- English: `references/en.md`
- Chinese: `references/zh.md`

## Voice

- Clear before clever.
- Warm, but brief.
- Prefer concrete next actions over reassurance.
- Avoid implying the user should understand terminal, config, or provider details.
- Never overclaim what the local agent, model, or runtime can do.

## Terms

| Concept | Preferred English |
| --- | --- |
| Agent process | runtime |
| Local API/gateway | local service |
| Conversation container | session |
| Long-running agent work | run |
| Tool/use progress | trace |
| Provider credentials | provider key |
| App-owned config | app-managed config |
| Native app bridge | desktop runtime |

One concept should have one term across the product. Do not alternate between runtime, daemon, server, process, and service unless the distinction matters.

## Writing Rules

1. Lead with the action or state.
2. Add technical detail only as helper text, details, or diagnostics.
3. Use strong verbs: Start, Stop, Retry, Connect, Save, Remove, Open, Copy.
4. Avoid vague labels: OK, Submit, Confirm, Continue, unless the context is unmistakable.
5. Destructive actions should name the object: Delete session, Remove key.

## Patterns

Empty state:

```text
Start a session
Describe what you want to do.
```

Runtime not ready:

```text
The local service is not running.
Start the local service, or open diagnostics for details.
```

Long wait:

```text
Still working. You can leave this view and come back.
```

Failure:

```text
That did not run through.
Retry, or open diagnostics to see what failed.
```

Credentials:

```text
Add a provider key
Keys are stored locally and used only for this runtime.
```

Permission:

```text
Allow folder access
The app needs this folder to read files you choose for the current run.
```

## Error Copy Must Include

1. What happened.
2. What the user can do next.
3. Where details live if the error is technical.

Do not blame the user. Put raw errors, stack traces, and codes in details or diagnostics.
