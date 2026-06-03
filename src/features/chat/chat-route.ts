export const chatSessionSearchParam = "session";

export interface PendingChatNavigationState {
  pendingPrompt: string;
}

export function chatPathForSession(sessionId: string | null) {
  return sessionId ? `/chat?${chatSessionSearchParam}=${encodeURIComponent(sessionId)}` : "/chat";
}

export function readPendingChatPrompt(state: unknown) {
  if (!isRecord(state)) {
    return null;
  }

  const pendingPrompt = state.pendingPrompt;
  return typeof pendingPrompt === "string" && pendingPrompt.trim() ? pendingPrompt.trim() : null;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}
