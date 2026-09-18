import { useCallback, useEffect, useMemo, useState } from "react";
import { where, type QueryConstraint } from "firebase/firestore";
import { seededDebates } from "@/data/firestoreSeeds";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type { ChatMessage, DebateThread } from "@/types/models";

export interface AppNotification {
  id: string;
  kind: "message" | "debate-turn";
  title: string;
  detail: string;
  timestamp: string;
  to: string;
  isUnread: boolean;
}

const EMPTY_MESSAGES: ChatMessage[] = [];
const LAST_SEEN_STORAGE_PREFIX = "debate-studio:notifications-seen:";
const READ_STORAGE_PREFIX = "debate-studio:notifications-read:";
const DEFAULT_HISTORY_DAYS = 30;

const getHistoryDays = (days: number | undefined) =>
  Number.isInteger(days) && days !== undefined && days >= 1 && days <= 365
    ? days
    : DEFAULT_HISTORY_DAYS;

// The "seen" marker is a per-device convenience, so it lives in localStorage
// rather than costing a Firestore document per user.
const readLastSeen = (userId: string) => {
  try {
    return window.localStorage.getItem(`${LAST_SEEN_STORAGE_PREFIX}${userId}`) ?? "";
  } catch {
    return "";
  }
};

const readVersions = (userId: string): Record<string, string> => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(`${READ_STORAGE_PREFIX}${userId}`) ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(
      Object.entries(stored).filter((entry): entry is [string, string] =>
        typeof entry[1] === "string"),
    );
  } catch {
    return {};
  }
};

export const useNotifications = (userId: string | undefined, historyDays?: number) => {
  const [lastSeen, setLastSeen] = useState("");
  const [readById, setReadById] = useState<Record<string, string>>({});

  useEffect(() => {
    setLastSeen(userId ? readLastSeen(userId) : "");
    setReadById(userId ? readVersions(userId) : {});
  }, [userId]);

  const messageConstraints = useMemo<QueryConstraint[]>(
    () => (userId ? [where("participantIds", "array-contains", userId)] : []),
    [userId],
  );
  const messageState = useSeededFirestoreCollection<ChatMessage>(
    "chatMessages",
    EMPTY_MESSAGES,
    messageConstraints,
    Boolean(userId),
    userId ? `notification-messages:${userId}` : undefined,
  );
  const debateState = useSeededFirestoreCollection("debates", seededDebates);

  const notifications = useMemo<AppNotification[]>(() => {
    if (!userId) return [];
    const cutoff = Date.now() - getHistoryDays(historyDays) * 24 * 60 * 60 * 1000;

    const messageAlerts = messageState.data
      .filter((message) =>
        Boolean(message.createdAt)
        && message.authorId !== userId)
      .map((message) => ({
        id: `message-${message.id}`,
        kind: "message" as const,
        title: `New message from ${message.authorName || "a member"}`,
        detail: message.content || "Sent you a message.",
        timestamp: message.createdAt,
        to: `/app/messages?thread=${encodeURIComponent(message.threadId)}`,
      }));

    const turnAlerts = (debateState.data as DebateThread[])
      .filter((debate) => (debate.participantIds ?? []).includes(userId))
      .flatMap((debate) => {
        const to = `/app/debates/${debate.id}`;
        const submittedTurns = (debate.turns ?? []).flatMap((turn, index) =>
          turn.authorId && turn.authorId !== userId
          && turn.submittedAt && index + 1 < debate.totalRounds
            ? [{
                id: `debate-${debate.id}-after-${turn.id}`,
                kind: "debate-turn" as const,
                title: "Your debate turn",
                detail: debate.topic,
                timestamp: turn.submittedAt,
                to,
              }]
            : [],
        );
        if (
          (debate.status === "Active" || debate.status === "Completed")
          && debate.affirmative.userId === userId
        ) {
          submittedTurns.push({
            id: `debate-${debate.id}-start`,
            kind: "debate-turn",
            title: "Your debate turn",
            detail: debate.topic,
            timestamp: debate.createdAt ?? debate.nextDeadline ?? "",
            to,
          });
        }
        return submittedTurns;
      });

    return [...messageAlerts, ...turnAlerts]
      .filter((notification) => {
        const time = Date.parse(notification.timestamp);
        return Number.isFinite(time) && time >= cutoff;
      })
      .map((notification) => ({
        ...notification,
        isUnread: notification.timestamp > (
          readById[notification.id] && readById[notification.id] > lastSeen
            ? readById[notification.id]
            : lastSeen
        ),
      }))
      .sort((left, right) =>
        Number(right.isUnread) - Number(left.isUnread)
        || right.timestamp.localeCompare(left.timestamp),
      );
  }, [debateState.data, historyDays, lastSeen, messageState.data, readById, userId]);

  const markRead = useCallback((notification: AppNotification) => {
    if (!userId) return;
    setReadById((current) => {
      const next = { ...current, [notification.id]: notification.timestamp };
      try {
        window.localStorage.setItem(`${READ_STORAGE_PREFIX}${userId}`, JSON.stringify(next));
      } catch {
        // Reading remains available for this session if site storage is blocked.
      }
      return next;
    });
  }, [userId]);

  const markAllRead = useCallback(() => {
    if (!userId) return;
    setReadById((current) => {
      const next = { ...current };
      notifications.forEach((notification) => {
        next[notification.id] = notification.timestamp;
      });
      try {
        window.localStorage.setItem(`${READ_STORAGE_PREFIX}${userId}`, JSON.stringify(next));
      } catch {
        // Reading remains available for this session if site storage is blocked.
      }
      return next;
    });
  }, [notifications, userId]);

  const unreadCount = notifications.filter((notification) => notification.isUnread).length;

  return { notifications, unreadCount, markRead, markAllRead };
};
