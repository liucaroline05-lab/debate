import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { MessageCircle, Plus, Search, Send, UserRound, UsersRound, X } from "lucide-react";
import { PageMeta } from "@/components/common/PageMeta";
import { seededUsers } from "@/data/firestoreSeeds";
import { useAuth } from "@/features/auth/AuthContext";
import {
  sendChatMessage,
  startDirectThread,
  startGroupThread,
  subscribeToMessages,
  subscribeToThreads,
} from "@/features/messages/messageService";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type { ChatMessage, ChatThread, UserProfile } from "@/types/models";

type ComposerMode = "direct" | "group";

const formatMessageTime = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat(undefined, isToday
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" }).format(date);
};

const safeInitial = (name?: string) => name?.trim().charAt(0).toUpperCase() || "?";

const ProfileAvatar = ({ user, small = false }: { user?: UserProfile; small?: boolean }) =>
  user?.avatarUrl ? (
    <img
      src={user.avatarUrl}
      alt=""
      className={small ? "message-avatar is-small" : "message-avatar"}
    />
  ) : (
    <span
      className={small ? "message-avatar message-avatar-fallback is-small" : "message-avatar message-avatar-fallback"}
      aria-hidden="true"
    >
      {safeInitial(user?.displayName)}
    </span>
  );

export const MessagesPage = () => {
  const { currentUser } = useAuth();
  const usersState = useSeededFirestoreCollection<UserProfile>("users", seededUsers);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThreadsLoading, setIsThreadsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("direct");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [composerError, setComposerError] = useState("");
  const messageEndRef = useRef<HTMLDivElement>(null);

  const userById = useMemo(
    () => new Map(usersState.data.map((user) => [user.id, user])),
    [usersState.data],
  );
  const activeThread = threads.find((thread) => thread.id === activeThreadId);
  const availableUsers = useMemo(() => {
    const normalizedSearch = peopleSearch.trim().toLowerCase();
    return usersState.data
      .filter((user) => user.id !== currentUser?.id)
      .filter((user) => {
        if (!normalizedSearch) return true;
        return `${user.displayName} ${user.username ?? ""} ${user.organizationTags.join(" ")}`
          .toLowerCase()
          .includes(normalizedSearch);
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }, [currentUser?.id, peopleSearch, usersState.data]);

  useEffect(() => {
    if (!currentUser) {
      setIsThreadsLoading(false);
      return;
    }

    try {
      return subscribeToThreads(
        currentUser.id,
        (nextThreads) => {
          setThreads(nextThreads);
          setActiveThreadId((current) => {
            if (current && nextThreads.some((thread) => thread.id === current)) return current;
            return nextThreads[0]?.id ?? "";
          });
          setIsThreadsLoading(false);
          setPageError("");
        },
        (message) => {
          setPageError(message);
          setIsThreadsLoading(false);
        },
      );
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to load messages.");
      setIsThreadsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    setMessages([]);
    if (!activeThreadId) return;

    try {
      return subscribeToMessages(
        activeThreadId,
        (nextMessages) => {
          setMessages(nextMessages);
          setPageError("");
        },
        setPageError,
      );
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to load this conversation.");
    }
  }, [activeThreadId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  const threadPeople = (thread: ChatThread) =>
    thread.participantIds
      .filter((userId) => userId !== currentUser?.id)
      .map((userId) => userById.get(userId))
      .filter((user): user is UserProfile => Boolean(user));

  const threadTitle = (thread: ChatThread) => {
    if (thread.type === "group") return thread.name || "Untitled group";
    return threadPeople(thread)[0]?.displayName ?? "Direct message";
  };

  const resetComposer = () => {
    setShowComposer(false);
    setPeopleSearch("");
    setSelectedUserIds([]);
    setGroupName("");
    setComposerError("");
  };

  const setMode = (mode: ComposerMode) => {
    setComposerMode(mode);
    setSelectedUserIds([]);
    setComposerError("");
  };

  const toggleSelectedUser = (userId: string) => {
    setSelectedUserIds((current) => {
      if (composerMode === "direct") return [userId];
      return current.includes(userId)
        ? current.filter((selectedId) => selectedId !== userId)
        : [...current, userId];
    });
  };

  const createConversation = async () => {
    if (!currentUser || isCreating) return;
    setComposerError("");
    setIsCreating(true);

    try {
      const selectedUsers = selectedUserIds
        .map((userId) => userById.get(userId))
        .filter((user): user is UserProfile => Boolean(user));
      let threadId: string;
      if (composerMode === "direct") {
        const recipient = selectedUsers[0];
        if (!recipient) throw new Error("Choose someone to message.");
        threadId = await startDirectThread(currentUser, recipient);
      } else {
        threadId = await startGroupThread(currentUser, groupName, selectedUsers);
      }

      setActiveThreadId(threadId);
      resetComposer();
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Unable to start this conversation.");
    } finally {
      setIsCreating(false);
    }
  };

  const submitMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentUser || !activeThread || !messageDraft.trim() || isSending) return;

    setIsSending(true);
    setPageError("");
    try {
      await sendChatMessage(activeThread.id, currentUser, messageDraft);
      setMessageDraft("");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to send your message.");
    } finally {
      setIsSending(false);
    }
  };

  if (!currentUser) {
    return (
      <section className="empty-state">
        <h2 className="card-title">Messages unavailable</h2>
        <p className="card-copy">Sign in to start a private conversation.</p>
      </section>
    );
  }

  const activePeople = activeThread ? threadPeople(activeThread) : [];

  return (
    <>
      <PageMeta
        title="Messages"
        description="Private direct messages and group conversations with other debaters."
      />
      <header className="route-header messages-route-header">
        <div>
          <p className="eyebrow">Messages</p>
          <h1>Keep the conversation going.</h1>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowComposer(true)}>
          <Plus size={18} aria-hidden="true" />
          New message
        </button>
      </header>

      {showComposer ? (
        <section className="app-card message-new-card" aria-label="Start a conversation">
          <div className="message-new-header">
            <div>
              <p className="eyebrow">New conversation</p>
              <h2 className="card-title">Who would you like to message?</h2>
            </div>
            <button type="button" className="message-icon-button" aria-label="Close" onClick={resetComposer}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="settings-segment message-mode-picker" role="group" aria-label="Conversation type">
            <button
              type="button"
              className={composerMode === "direct" ? "settings-segment-option is-on" : "settings-segment-option"}
              aria-pressed={composerMode === "direct"}
              onClick={() => setMode("direct")}
            >
              <UserRound size={17} aria-hidden="true" /> Direct message
            </button>
            <button
              type="button"
              className={composerMode === "group" ? "settings-segment-option is-on" : "settings-segment-option"}
              aria-pressed={composerMode === "group"}
              onClick={() => setMode("group")}
            >
              <UsersRound size={17} aria-hidden="true" /> Group chat
            </button>
          </div>

          {composerMode === "group" ? (
            <div className="form-field message-group-name">
              <label htmlFor="messageGroupName">Group name</label>
              <input
                id="messageGroupName"
                value={groupName}
                maxLength={60}
                placeholder="e.g. Nationals prep"
                onChange={(event) => setGroupName(event.target.value)}
              />
            </div>
          ) : null}

          <label className="message-people-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search people</span>
            <input
              value={peopleSearch}
              placeholder="Search by name, username, or team"
              onChange={(event) => setPeopleSearch(event.target.value)}
            />
          </label>

          <div className="message-people-grid">
            {availableUsers.map((user) => {
              const selected = selectedUserIds.includes(user.id);
              const privacy = user.preferences?.messaging?.whoCanMessage ?? "everyone";
              return (
                <button
                  type="button"
                  key={user.id}
                  className={selected ? "message-person-option is-selected" : "message-person-option"}
                  aria-pressed={selected}
                  onClick={() => toggleSelectedUser(user.id)}
                >
                  <ProfileAvatar user={user} />
                  <span>
                    <strong>{user.displayName}</strong>
                    <small>{user.organizationTags[0] || `@${user.username ?? "member"}`}</small>
                  </span>
                  {privacy === "nobody" ? <span className="message-private-label">Private</span> : null}
                </button>
              );
            })}
          </div>

          <div className="message-new-footer">
            <p className="meta-line" aria-live="polite">
              {composerError || (composerMode === "group"
                ? `${selectedUserIds.length} people selected`
                : selectedUserIds.length > 0 ? "Ready to start chatting" : "Choose one person")}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isCreating || selectedUserIds.length === 0}
              onClick={() => void createConversation()}
            >
              {isCreating ? "Starting..." : "Start conversation"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="messages-shell">
        <aside className="messages-list-panel" aria-label="Conversations">
          <div className="messages-list-heading">
            <div>
              <span className="meta-line">Your inbox</span>
              <strong>{threads.length} conversation{threads.length === 1 ? "" : "s"}</strong>
            </div>
            <MessageCircle size={21} aria-hidden="true" />
          </div>

          <div className="messages-thread-list">
            {isThreadsLoading ? <p className="messages-list-status">Loading conversations...</p> : null}
            {!isThreadsLoading && threads.length === 0 ? (
              <div className="messages-list-status">
                <strong>No messages yet</strong>
                <span>Start a DM or bring a prep group together.</span>
              </div>
            ) : null}
            {threads.map((thread) => {
              const people = threadPeople(thread);
              const previewUser = people[0];
              return (
                <button
                  type="button"
                  key={thread.id}
                  className={activeThreadId === thread.id ? "message-thread-button is-active" : "message-thread-button"}
                  onClick={() => setActiveThreadId(thread.id)}
                >
                  {thread.type === "group" ? (
                    <span className="message-avatar message-avatar-fallback message-group-avatar" aria-hidden="true">
                      <UsersRound size={20} />
                    </span>
                  ) : <ProfileAvatar user={previewUser} />}
                  <span className="message-thread-copy">
                    <span className="message-thread-title">
                      <strong>{threadTitle(thread)}</strong>
                      <small>{formatMessageTime(thread.lastMessageAt ?? thread.updatedAt)}</small>
                    </span>
                    <span>{thread.lastMessageText || (thread.type === "group" ? `${thread.memberCount} members` : "Start the conversation")}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <article className="messages-chat-panel">
          {activeThread ? (
            <>
              <header className="messages-chat-header">
                <div>
                  <h2>{threadTitle(activeThread)}</h2>
                  <span>
                    {activeThread.type === "group"
                      ? `${activeThread.memberCount} members`
                      : activePeople[0]?.organizationTags[0] || "Direct message"}
                  </span>
                </div>
                <div className="message-header-avatars" aria-label="Conversation members">
                  {activePeople.slice(0, 4).map((user) => <ProfileAvatar key={user.id} user={user} small />)}
                </div>
              </header>

              <div className="messages-scroll-region" aria-live="polite">
                {messages.length === 0 ? (
                  <div className="messages-conversation-empty">
                    <span className="message-empty-icon"><MessageCircle size={28} /></span>
                    <strong>This is the beginning of the conversation.</strong>
                    <p>Messages here are only visible to people in this chat.</p>
                  </div>
                ) : null}
                {messages.map((message, index) => {
                  const isOwn = message.authorId === currentUser.id;
                  const previous = messages[index - 1];
                  const showAuthor = !previous || previous.authorId !== message.authorId;
                  return (
                    <div key={message.id} className={isOwn ? "message-row is-own" : "message-row"}>
                      {!isOwn && showAuthor ? <ProfileAvatar user={userById.get(message.authorId)} small /> : <span className="message-avatar-spacer" />}
                      <div className="message-bubble-wrap">
                        {showAuthor ? (
                          <span className="message-author-line">
                            <strong>{isOwn ? "You" : message.authorName}</strong>
                            <small>{formatMessageTime(message.createdAt)}</small>
                          </span>
                        ) : null}
                        <p className="message-bubble">{message.content}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messageEndRef} />
              </div>

              <form className="message-compose-bar" onSubmit={(event) => void submitMessage(event)}>
                <label htmlFor="messageDraft" className="sr-only">Message {threadTitle(activeThread)}</label>
                <textarea
                  id="messageDraft"
                  value={messageDraft}
                  rows={1}
                  maxLength={4000}
                  placeholder={`Message ${threadTitle(activeThread)}`}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <button type="submit" className="message-send-button" disabled={isSending || !messageDraft.trim()} aria-label="Send message">
                  <Send size={19} aria-hidden="true" />
                </button>
              </form>
            </>
          ) : (
            <div className="messages-chat-empty">
              <span className="message-empty-icon"><MessageCircle size={30} /></span>
              <h2>Choose a conversation</h2>
              <p>Select a chat from your inbox, or start a new one.</p>
              <button type="button" className="btn btn-primary" onClick={() => setShowComposer(true)}>
                <Plus size={18} aria-hidden="true" /> New message
              </button>
            </div>
          )}
        </article>
      </section>
      {pageError ? <p className="messages-page-error" role="alert">{pageError}</p> : null}
    </>
  );
};
