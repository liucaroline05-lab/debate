import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Search, Send, UsersRound, X } from "lucide-react";
import { seededUsers } from "@/data/firestoreSeeds";
import { useAuth } from "@/features/auth/AuthContext";
import {
  sendChatMessage,
  startDirectThread,
  subscribeToThreads,
} from "@/features/messages/messageService";
import { normalizeUserProfile } from "@/features/users/defaultProfile";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type { ChatThread, UserProfile } from "@/types/models";

interface ShareToMessageDialogProps {
  /** What is being shared, used to build the message body. */
  title: string;
  url: string;
  onClose: () => void;
  allowCopyLink?: boolean;
  onBeforeSend?: (recipientIds: string[]) => Promise<void>;
}

type Target =
  | { kind: "thread"; id: string; label: string; thread: ChatThread }
  | { kind: "person"; id: string; label: string; person: UserProfile };

const safeInitial = (value?: string) => value?.trim().charAt(0).toUpperCase() || "?";

/**
 * Sends a link to an existing conversation or straight to a person, creating
 * the direct thread first when there is not one yet.
 */
export const ShareToMessageDialog = ({ title, url, onClose, allowCopyLink = true, onBeforeSend }: ShareToMessageDialogProps) => {
  const { currentUser } = useAuth();
  const usersState = useSeededFirestoreCollection("users", seededUsers);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [busyTargetId, setBusyTargetId] = useState("");
  const [sentTargetId, setSentTargetId] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    try {
      return subscribeToThreads(currentUser.id, setThreads, setError);
    } catch (subscribeError) {
      setError(
        subscribeError instanceof Error
          ? subscribeError.message
          : "Unable to load your conversations.",
      );
    }
  }, [currentUser]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const people = useMemo(
    () => usersState.data.map((user) => normalizeUserProfile(user)),
    [usersState.data],
  );
  const personById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people],
  );

  const targets = useMemo<Target[]>(() => {
    if (!currentUser) return [];

    const threadTargets = threads.map((thread) => {
      const others = (thread.participantIds ?? []).filter((id) => id !== currentUser.id);
      const label =
        thread.type === "group"
          ? thread.name || "Group chat"
          : personById.get(others[0] ?? "")?.displayName ?? "Direct message";
      return { kind: "thread" as const, id: thread.id, label, thread };
    });

    // People you have not messaged yet, so sharing does not require finding
    // them in Messages first.
    const existingDirectIds = new Set(
      threads
        .filter((thread) => thread.type === "direct")
        .flatMap((thread) => thread.participantIds ?? []),
    );
    const personTargets = people
      .filter((person) => person.id !== currentUser.id && !existingDirectIds.has(person.id))
      .map((person) => ({
        kind: "person" as const,
        id: `person-${person.id}`,
        label: person.displayName,
        person,
      }));

    const normalized = search.trim().toLowerCase();
    return [...threadTargets, ...personTargets].filter((target) =>
      normalized ? target.label.toLowerCase().includes(normalized) : true,
    );
  }, [currentUser, people, personById, search, threads]);

  const shareTo = async (target: Target) => {
    if (!currentUser || busyTargetId) return;

    setBusyTargetId(target.id);
    setError("");
    const body = [note.trim(), `${title} — ${url}`].filter(Boolean).join("\n\n");

    try {
      let thread = target.kind === "thread" ? target.thread : null;
      if (!thread) {
        const threadId = await startDirectThread(currentUser, (target as Extract<Target, { kind: "person" }>).person);
        // startDirectThread returns an id; the message only needs the
        // participants, which are known without re-reading the document.
        thread = {
          id: threadId,
          type: "direct",
          createdBy: currentUser.id,
          participantIds: [currentUser.id, (target as Extract<Target, { kind: "person" }>).person.id].sort(),
          memberCount: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      await onBeforeSend?.(thread.participantIds.filter((id) => id !== currentUser.id));
      await sendChatMessage(thread, currentUser, body);
      setSentTargetId(target.id);
      window.setTimeout(() => setSentTargetId(""), 2_000);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to share that.");
    } finally {
      setBusyTargetId("");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("Could not copy the link. Select and copy it manually.");
    }
  };

  return (
    <div className="share-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="share-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Share"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="share-dialog-header">
          <div>
            <p className="eyebrow">Share</p>
            <h2 className="card-title">Send to a conversation</h2>
          </div>
          <button type="button" className="message-icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {!currentUser ? (
          <p className="card-copy">Sign in to share this through messages.</p>
        ) : (
          <>
            <div className="form-field">
              <label htmlFor="shareNote">Add a note (optional)</label>
              <input
                id="shareNote"
                value={note}
                maxLength={280}
                placeholder="Thought you would find this useful"
                onChange={(event) => setNote(event.target.value)}
              />
            </div>

            <label className="message-people-search">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">Search conversations and people</span>
              <input
                value={search}
                placeholder="Search conversations and people"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <div className="share-target-list">
              {targets.length === 0 ? (
                <p className="meta-line">No conversations or people match that search.</p>
              ) : null}
              {targets.slice(0, 40).map((target) => (
                <div key={target.id} className="share-target-row">
                  <span className="message-avatar message-avatar-fallback" aria-hidden="true">
                    {target.kind === "thread" && target.thread.type === "group" ? (
                      <UsersRound size={18} />
                    ) : (
                      safeInitial(target.label)
                    )}
                  </span>
                  <span className="share-target-name">
                    <strong>{target.label}</strong>
                    <small>
                      {target.kind === "thread"
                        ? target.thread.type === "group"
                          ? `${target.thread.memberCount ?? 0} members`
                          : "Direct message"
                        : "Start a new chat"}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busyTargetId === target.id}
                    onClick={() => void shareTo(target)}
                  >
                    {sentTargetId === target.id ? (
                      <>
                        <Check size={16} aria-hidden="true" /> Sent
                      </>
                    ) : (
                      <>
                        <Send size={16} aria-hidden="true" />
                        {busyTargetId === target.id ? "Sending..." : "Send"}
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <div className="share-dialog-footer">
          <span className="meta-line share-dialog-url">
            {allowCopyLink ? url : "Only people you send this private speech to can open it."}
          </span>
          {allowCopyLink ? (
            <button type="button" className="btn btn-ghost" onClick={() => void copyLink()}>
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copied ? "Copied" : "Copy link"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
