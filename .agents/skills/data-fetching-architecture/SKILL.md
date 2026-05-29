---
name: data-fetching-architecture
description: "Data-fetching architecture - React Query hooks, `HermesBackend`, `HermesApiClient`, stable query keys, mutation invalidation, API normalization, and avoiding ad hoc component fetches. Use when implementing server data, creating feature hooks, wiring queries/mutations, or changing API calls. Triggers on 'data fetching', 'React Query', 'useQuery', 'useMutation', 'query key', 'HermesApiClient', 'HermesBackend', 'API response', 'cache invalidation'."
user-invocable: false
---

# Data Fetching Architecture

This project uses a small service boundary plus React Query:

```text
Component
  -> feature hook / query helper
  -> HermesBackend
  -> HermesApiClient
  -> local service
```

## Core Rules

- Components should not call `fetch` directly for protocol data.
- Put transport details in `src/lib/hermes/api.ts`.
- Put backend capability orchestration behind `src/lib/hermes/backend.ts`.
- Put shared query helpers in `src/lib/hermes/queries.ts`.
- Keep feature-specific orchestration in `src/features/<feature>/hooks`.
- Treat API/SSE payloads as untrusted at the boundary and normalize once.

## Query Pattern

Use stable query keys and typed query functions:

```ts
export const hermesKeys = {
  all: ["hermes"] as const,
  sessions: () => [...hermesKeys.all, "sessions"] as const,
  session: (id: string) => [...hermesKeys.sessions(), id] as const,
};
```

Guidelines:

- Include every value that changes the returned data in the key.
- Keep keys serializable and stable.
- Set `enabled` instead of branching inside the query function when required data is missing.
- Use `select` only for cheap derivations or stable projections.

## Mutation Pattern

After create/update/delete operations:

1. Call the backend or API client.
2. Invalidate or update the smallest useful query key.
3. Keep optimistic updates narrow and reversible.
4. Surface errors to the UI with a next action.

Do not hide failed mutations behind silent fallbacks.

## Streaming Pattern

React Query is for request/response server state. Streaming chat runs need explicit orchestration:

- Parse SSE in `src/lib/hermes/api.ts`.
- Normalize stream events in `src/features/chat/stream-events.ts`.
- Abort with `AbortController` when stopping, retrying, changing sessions, or unmounting.
- Update query cache only at stable boundaries, such as session/message completion.

## Component Pattern

- Page components compose.
- Feature hooks orchestrate data, mutations, and derived UI state.
- Components receive stable data shapes and callback props.
- Loading, empty, error, and success states are explicit.

## Common Mistakes

| Mistake | Better |
| --- | --- |
| `useEffect(() => fetch(...))` in a page | `useQuery` in a feature hook or shared query helper |
| Multiple components parse the same response shape | Normalize once in the API/client boundary |
| Broad invalidation after every mutation | Invalidate the smallest stable query key |
| Silent fallback on API failure | Surface error and offer Retry/View details |
| Stream state spread across many components | Keep stream orchestration in the chat workspace hook |
