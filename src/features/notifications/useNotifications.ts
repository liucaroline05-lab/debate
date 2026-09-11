import { useCallback, useEffect, useMemo, useState } from "react";
import { where, type QueryConstraint } from "firebase/firestore";
import { seededDebates } from "@/data/firestoreSeeds";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type { ChatThread, DebateThread } from "@/types/models";

export interface AppNotification {
  id: string;
  kind: "message" | "debate-turn";
  title: string;
  detail: string;
  timestamp: string;
  to: string;
}

const EMPTY_THREADS: ChatThread[] = [];
const LAST_SEEN_STORAGE_PREFIX = "debate-studio:notifications-seen:";

// The "seen" marker is a per-device convenience, so it lives in localStorage
// rather than costing a Firestore document per user.
const readLastSeen = (userId: string) => {
  try {
    return window.localStorage.getItem(`${LAST_SEEN_STORAGE_PREFIX}${userId}`) ?? "";
  } catch {
    return "";
  }
};

const writeLastSeen = (userId: string, value: string) => {
  try {
    window.localStorage.setItem(`${LAST_SEEN_STORAGE_PREFIX}${userId}`, value);
  } catch {
    // Private windows and blocked site data just lose the marker.
  }
};

export const useNotifications = (userId: string | undefined) => {
  const [lastSeen, setLastSeen] = useState("");

  useEffect(() => {
    setLastSeen(userId ? readLastSeen(userId) : "");
  }, [userId]);

  const threadConstraints = useMemo<QueryConstraint[]>(
    () => (userId ? [where("participantIds", "array-contains", userId)] : []),
    [userId],
  );
  const threadState = useSeededFirestoreCollection<ChatThread>(
    "chatThreads",
    EMPTY_THREADS,
    threadConstraints,
    Boolean(userId),
    userId ? `notification-threads:${userId}` : undefined,
  );
  const debateState = useSeededFirestoreCollection("debates", seededDebates);

  const notifications = useMemo<AppNotification[]>(() => {
    if (!userId) return [];

    const messageAlerts = threadState.data
      .filter((thread) =>
        Boolean(thread.lastMessageAt)
        && thread.lastMessageSenderId !== userId
        && (thread.lastMessageAt ?? "") > lastSeen)
      .map((thread) => ({
        id: `message-${thread.id}`,
        kind: "message" as const,
        title: thread.type === "group" ? thread.name || "Group chat" : "New message",
        detail: thread.lastMessageText || "Sent you a message.",
        timestamp: thread.lastMessageAt ?? "",
        to: "/app/messages",
      }));

    const turnAlerts = (debateState.data as DebateThread[])
      .filter((debate) =>
        debate.status === "Active"
        && debate.currentTurnUserId === userId
        && (debate.participantIds ?? []).includes(userId))
      .map((debate) => ({
        id: `debate-${debate.id}`,
        kind: "debate-turn" as const,
        title: "Your turn to speak",
        detail: debate.topic,
        timestamp: debate.nextDeadline ?? "",
        to: `/app/debates/${debate.id}`,
      }));

    return [...messageAlerts, ...turnAlerts].sort((left, right) =>
      right.timestamp.localeCompare(left.timestamp),
    );
  }, [debateState.data, lastSeen, threadState.data, userId]);

  const markAllSeen = useCallback(() => {
    if (!userId) return;
    const now = new Date().toISOString();
    writeLastSeen(userId, now);
    setLastSeen(now);
  }, [userId]);

  // Turn alerts are a standing state rather than something you dismiss, so the
  // badge only counts what "mark as read" can actually clear.
  const unreadCount = notifications.filter(
    (notification) => notification.kind === "message",
  ).length;

  return { notifications, unreadCount, markAllSeen };
};
