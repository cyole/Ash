---
name: microcopy
description: Hermes UI microcopy guide for labels, buttons, empty states, errors, onboarding, runtime status, chat streaming, settings, and diagnostics. Use when writing or editing user-facing copy in English or Chinese.
user-invocable: false
---

# Hermes Microcopy Guide

Hermes is a local-first assistant workspace. Copy should make local runtime work feel understandable, calm, and controllable.

## Voice

- Clear before clever.
- Warm, but brief.
- Prefer concrete next actions over reassurance.
- Avoid implying the user should understand terminal, config, or provider details.

## Terms

| Concept | Preferred English |
| --- | --- |
| Hermes Agent process | runtime |
| Local API/gateway | local service |
| Conversation container | session |
| Long-running agent work | run |
| Tool/use progress | trace |
| Provider credentials | provider key |
| App-owned config | app-managed config |

## Patterns

Empty state:

```text
Start a session
Describe what you want Hermes to do.
```

Runtime not ready:

```text
Hermes is not running.
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
Keys are stored locally and used only for this Hermes runtime.
```

## Error Copy Must Include

1. What happened.
2. What the user can do next.
3. Where details live if the error is technical.

Do not blame the user. Put raw errors, stack traces, and codes in details or diagnostics.

## Buttons

- Use strong verbs: Start, Stop, Retry, Connect, Save, Remove, Open, Copy.
- Avoid vague labels: OK, Submit, Confirm, Continue, unless the context is unmistakable.
- Destructive actions should name the object: Delete session, Remove key.
