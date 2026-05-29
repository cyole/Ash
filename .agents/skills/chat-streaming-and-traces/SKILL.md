---
name: chat-streaming-and-traces
description: Hermes chat streaming, SSE parsing, trace panel, run events, approvals, and message state guide. Use when editing `src/features/chat/**`, `src/lib/hermes/api.ts`, stream parsing, stop/retry behavior, trace UI, tool/run status, or chat session handling.
user-invocable: false
---

# Hermes Chat Streaming and Traces

The chat surface should make long-running agent work visible without turning the UI into raw logs.

## Ownership

| Concern | Location |
| --- | --- |
| HTTP and SSE transport | `src/lib/hermes/api.ts` |
| Protocol types | `src/lib/hermes/types.ts` |
| Chat workspace orchestration | `src/features/chat/hooks/useChatWorkspace.ts` |
| Stream event normalization | `src/features/chat/stream-events.ts` |
| Page composition | `src/features/chat/ChatPage.tsx` |
| Messages | `src/features/chat/components/ChatMessageList.tsx`, `MessageBubble.tsx` |
| Composer | `src/features/chat/components/ChatComposer.tsx` |
| Trace UI | `src/features/chat/components/TracePanel.tsx` |

## Stream Rules

- Parse SSE only at the transport boundary.
- Keep `parseSseStream` tolerant of split chunks, multiline `data:`, JSON data, raw string data, and `[DONE]`.
- Convert provider-specific deltas in `stream-events.ts`; do not spread response-shape checks across components.
- Treat event names as unstable unless documented. Provide safe fallbacks.
- Abort streams with `AbortController` when stopping, retrying, changing sessions, or unmounting.
- Preserve a coherent assistant message even if the final event arrives after deltas.

## Trace Rules

- Trace items are for user-understandable progress, not raw payload dumps.
- Show stable labels, short detail, and one of `running`, `done`, or `error`.
- Collapse or truncate large JSON payloads. Provide details only when useful.
- Never display secrets from request headers, `.env`, tool args, or provider config.
- Failed events should be visible in both the trace panel and final message state when they affect the answer.

## Session Rules

- Send `X-Hermes-Session-Id` for chat completions.
- Preserve backend session IDs and avoid mixing messages between UI sessions.
- Fallback endpoints in `HermesApiClient` are acceptable while upstream Hermes API compatibility is settling, but keep the fallback localized.

## UI Expectations

- The composer should clearly reflect `apiReady`, model loading/error, streaming, retry, and stop states.
- The message list should not jump during streaming.
- The trace panel should be useful even when no trace events have arrived.
- Errors should offer a next action: retry, check runtime status, or view diagnostics.
