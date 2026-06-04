import { useSyncExternalStore } from "react";

export type ChatSessionActivityKind = "generating" | "unread";

export interface ChatSessionActivity {
  kind: ChatSessionActivityKind;
  updatedAt: number;
}

type ChatSessionActivities = Record<string, ChatSessionActivity>;

let activities: ChatSessionActivities = {};
const listeners = new Set<() => void>();

export function useChatSessionActivities() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function markChatSessionGenerating(sessionId: string) {
  setSessionActivity(sessionId, {
    kind: "generating",
    updatedAt: Date.now(),
  });
}

export function markChatSessionFinished(sessionId: string, viewed: boolean) {
  if (viewed) {
    clearChatSessionActivity(sessionId);
    return;
  }

  setSessionActivity(sessionId, {
    kind: "unread",
    updatedAt: Date.now(),
  });
}

export function markChatSessionViewed(sessionId: string) {
  if (activities[sessionId]?.kind !== "unread") {
    return;
  }

  clearChatSessionActivity(sessionId);
}

export function clearChatSessionActivity(sessionId: string) {
  if (!(sessionId in activities)) {
    return;
  }

  const nextActivities = { ...activities };
  delete nextActivities[sessionId];
  activities = nextActivities;
  emit();
}

function setSessionActivity(sessionId: string, activity: ChatSessionActivity) {
  activities = {
    ...activities,
    [sessionId]: activity,
  };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return activities;
}

function emit() {
  for (const listener of listeners) {
    listener();
  }
}
