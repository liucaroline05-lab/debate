import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Mic,
  Pencil,
  Square,
  Plus,
  Search,
  Send,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { PageMeta } from "@/components/common/PageMeta";
import { seededUsers } from "@/data/firestoreSeeds";
import { useAuth } from "@/features/auth/AuthContext";
import { MessageContent } from "@/features/messages/MessageContent";
import { ChatAttachmentView } from "@/features/messages/ChatAttachmentView";
import { sendChatAttachment, validateChatAttachment } from "@/features/messages/chatAttachmentService";
import {
  deleteChatMessage,
  editChatMessage,
  sendChatMessage,
  startDirectThread,
  startGroupThread,
  subscribeToMessages,
  subscribeToThreads,
} from "@/features/messages/messageService";
import { normalizeUserProfile } from "@/features/users/defaultProfile";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedThreadId = searchParams.get("thread");
  const usersState = useSeededFirestoreCollection<UserProfile>("users", seededUsers);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [isThreadsLoading, setIsThreadsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [openMessageActionsId, setOpenMessageActionsId] = useState("");
  const [messageMenuOpensUp, setMessageMenuOpensUp] = useState(false);
  const [messageMenuAlignLeft, setMessageMenuAlignLeft] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editDraft, setEditDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [messageActionError, setMessageActionError] = useState("");
  const [busyMessageId, setBusyMessageId] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("direct");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [composerError, setComposerError] = useState("");
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  // Firestore user documents are raw here: older accounts predate fields like
  // organizationTags, and reading one of those straight off the document threw
  // during render, which the router reported as a missing page.
  const people = useMemo(
    () => usersState.data.map((user) => normalizeUserProfile(user)),
    [usersState.data],
  );
  const userById = useMemo(
    () => new Map(people.map((user) => [user.id, user])),
    [people],
  );
  const activeThread = threads.find((thread) => thread.id === activeThreadId);
  const availableUsers = useMemo(() => {
    const normalizedSearch = peopleSearch.trim().toLowerCase();
    return people
      .filter((user) => user.id !== currentUser?.id)
      .filter((user) => {
        if (!normalizedSearch) return true;
        return `${user.displayName} ${user.username ?? ""} ${user.organizationTags.join(" ")}`
          .toLowerCase()
          .includes(normalizedSearch);
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }, [currentUser?.id, peopleSearch, people]);

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
    if (requestedThreadId && threads.some((thread) => thread.id === requestedThreadId)) {
      setActiveThreadId(requestedThreadId);
    }
  }, [requestedThreadId, threads]);

  useEffect(() => {
    setMessages([]);
    setMessagesError("");
    setOpenMessageActionsId("");
    setEditingMessageId("");
    setDeleteTarget(null);
    if (!activeThreadId) {
      setIsMessagesLoading(false);
      return;
    }

    setIsMessagesLoading(true);
    try {
      return subscribeToMessages(
        activeThreadId,
        (nextMessages) => {
          setMessages(nextMessages);
          setMessagesError("");
          setIsMessagesLoading(false);
        },
        (message) => {
          setMessagesError(message);
          setIsMessagesLoading(false);
        },
      );
    } catch (error) {
      setMessagesError(
        error instanceof Error ? error.message : "Unable to load this conversation.",
      );
      setIsMessagesLoading(false);
    }
  }, [activeThreadId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  const threadPeople = (thread: ChatThread) =>
    (thread.participantIds ?? [])
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
      setSearchParams({ thread: threadId });
      resetComposer();
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Unable to start this conversation.");
    } finally {
      setIsCreating(false);
    }
  };

  const submitMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentUser || !activeThread || (!messageDraft.trim() && !attachmentFile) || isSending) return;

    setIsSending(true);
    setPageError("");
    try {
      if (attachmentFile) {
        await sendChatAttachment(activeThread.id, attachmentFile, messageDraft);
        setAttachmentFile(null);
      } else {
        await sendChatMessage(activeThread, currentUser, messageDraft);
      }
      setMessageDraft("");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to send your message.");
    } finally {
      setIsSending(false);
    }
  };

  const saveMessageEdit = async (event: FormEvent) => {
    event.preventDefault();
    const message = messages.find((item) => item.id === editingMessageId);
    if (!currentUser || !message || busyMessageId) return;
    setBusyMessageId(message.id);
    setMessageActionError("");
    try {
      await editChatMessage(message, currentUser.id, editDraft);
      setEditingMessageId("");
      setEditDraft("");
    } catch (error) {
      setMessageActionError(error instanceof Error ? error.message : "Unable to edit this message.");
    } finally {
      setBusyMessageId("");
    }
  };

  const confirmMessageDelete = async () => {
    if (!currentUser || !deleteTarget || busyMessageId) return;
    setBusyMessageId(deleteTarget.id);
    setMessageActionError("");
    try {
      await deleteChatMessage(deleteTarget, currentUser.id);
      setDeleteTarget(null);
    } catch (error) {
      setMessageActionError(error instanceof Error ? error.message : "Unable to delete this message.");
    } finally {
      setBusyMessageId("");
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      recorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = ["audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      if (!preferredType) throw new Error("Voice recording is not supported in this browser.");
      recordingStreamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: preferredType });
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const file = new File(chunks, `voice-message.${preferredType === "audio/mp4" ? "m4a" : "webm"}`, { type: preferredType });
        try { validateChatAttachment(file); setAttachmentFile(file); setAttachmentError(""); }
        catch (error) { setAttachmentError(error instanceof Error ? error.message : "Recording could not be attached."); }
      };
      recorder.start();
      setIsRecording(true);
      setAttachmentError("");
    } catch (error) {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      setAttachmentError(error instanceof Error ? error.message : "Could not start recording.");
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
                  onClick={() => {
                    if (recorderRef.current && recorderRef.current.state !== "inactive") {
                      recorderRef.current.onstop = null;
                      recorderRef.current.stop();
                      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
                      setIsRecording(false);
                    }
                    setAttachmentFile(null);
                    setAttachmentError("");
                    setActiveThreadId(thread.id);
                    setSearchParams({ thread: thread.id });
                  }}
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
                    <span>{thread.lastMessageText || (thread.type === "group" ? `${thread.memberCount ?? thread.participantIds?.length ?? 0} members` : "Start the conversation")}</span>
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
                      ? `${activeThread.memberCount ?? activeThread.participantIds?.length ?? 0} members`
                      : activePeople[0]?.organizationTags?.[0] || "Direct message"}
                  </span>
                </div>
                <div className="message-header-avatars" aria-label="Conversation members">
                  {activePeople.slice(0, 4).map((user) => <ProfileAvatar key={user.id} user={user} small />)}
                </div>
              </header>

              <div className="messages-scroll-region" aria-live="polite">
                {messagesError ? (
                  <div className="messages-conversation-empty is-error" role="alert">
                    <span className="message-empty-icon"><AlertCircle size={28} /></span>
                    <strong>This conversation could not be loaded.</strong>
                    <p>{messagesError}</p>
                  </div>
                ) : isMessagesLoading ? (
                  <div className="messages-conversation-empty">
                    <span className="message-empty-icon"><MessageCircle size={28} /></span>
                    <strong>Loading messages...</strong>
                  </div>
                ) : messages.length === 0 ? (
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
                      {isOwn && !message.deletedAt && editingMessageId !== message.id ? <div className="forum-post-menu message-entry-actions">
                        <button type="button" className="forum-icon-button" aria-label={`Actions for message ${message.id}`} aria-expanded={openMessageActionsId === message.id} onClick={(event) => {
                          if (openMessageActionsId === message.id) {
                            setOpenMessageActionsId("");
                            return;
                          }
                          const buttonBounds = event.currentTarget.getBoundingClientRect();
                          const scrollBounds = event.currentTarget.closest(".messages-scroll-region")?.getBoundingClientRect();
                          if (scrollBounds) {
                            const roomBelow = scrollBounds.bottom - buttonBounds.bottom;
                            const roomAbove = buttonBounds.top - scrollBounds.top;
                            setMessageMenuOpensUp(roomBelow < 140 && roomAbove > roomBelow);
                            setMessageMenuAlignLeft(buttonBounds.left - scrollBounds.left < 184);
                          }
                          setOpenMessageActionsId(message.id);
                        }}>
                          <MoreHorizontal size={17} aria-hidden="true" />
                        </button>
                        {openMessageActionsId === message.id ? <div className={`forum-menu-dropdown${messageMenuOpensUp ? " opens-up" : ""}${messageMenuAlignLeft ? " align-left" : ""}`}>
                          {!message.attachment && !message.sharedPreview ? <button type="button" className="forum-menu-item" onClick={() => {
                            setEditingMessageId(message.id);
                            setEditDraft(message.content);
                            setMessageActionError("");
                            setOpenMessageActionsId("");
                          }}><Pencil size={16} aria-hidden="true" /> Edit message</button> : null}
                          <button type="button" className="forum-menu-item" onClick={() => {
                            setDeleteTarget(message);
                            setMessageActionError("");
                            setOpenMessageActionsId("");
                          }}><Trash2 size={16} aria-hidden="true" /> Delete message</button>
                        </div> : null}
                      </div> : null}
                      <div className="message-bubble-wrap">
                        {showAuthor ? (
                          <span className="message-author-line">
                            <strong>{isOwn ? "You" : message.authorName}</strong>
                            <small>{formatMessageTime(message.createdAt)}</small>
                          </span>
                        ) : null}
                        {message.deletedAt ? <div className="message-bubble is-deleted">message deleted</div>
                          : editingMessageId === message.id ? <form className="message-edit-form" onSubmit={(event) => void saveMessageEdit(event)}>
                            <label className="sr-only" htmlFor={`edit-message-${message.id}`}>Edit message text</label>
                            <textarea id={`edit-message-${message.id}`} value={editDraft} maxLength={4000} onChange={(event) => setEditDraft(event.target.value)} />
                            {messageActionError ? <p className="speech-field-error" role="alert">{messageActionError}</p> : null}
                            <div className="button-row">
                              <button type="button" className="btn btn-secondary" disabled={Boolean(busyMessageId)} onClick={() => { setEditingMessageId(""); setMessageActionError(""); }}>Cancel</button>
                              <button type="submit" className="btn btn-primary" disabled={Boolean(busyMessageId) || !editDraft.trim()}>{busyMessageId ? "Saving..." : "Save edit"}</button>
                            </div>
                          </form> : <>
                            {(!message.attachment || message.content !== `Shared ${message.attachment.kind}: ${message.attachment.name}`)
                              ? <MessageContent content={message.content} sharedPreview={message.sharedPreview} />
                              : null}
                            {message.attachment ? <ChatAttachmentView message={message} viewerId={currentUser.id} /> : null}
                            {message.editedAt ? <span className="message-edited-label">edited</span> : null}
                          </>}
                      </div>
                    </div>
                  );
                })}
                <div ref={messageEndRef} />
              </div>

              <form className="message-compose-bar" onSubmit={(event) => void submitMessage(event)}>
                <label className="message-attach-button" aria-label="Attach a file" title="Attach a file"><Paperclip size={19} aria-hidden="true" />
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,audio/*,.pdf,.docx,.txt" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try { validateChatAttachment(file); setAttachmentFile(file); setAttachmentError(""); }
                    catch (error) { setAttachmentError(error instanceof Error ? error.message : "This file cannot be attached."); }
                    event.target.value = "";
                  }} />
                </label>
                <button type="button" className="message-attach-button" aria-label={isRecording ? "Stop recording" : "Record a voice message"} onClick={() => void toggleRecording()}>{isRecording ? <Square size={17} /> : <Mic size={19} />}</button>
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
                <button type="submit" className="message-send-button" disabled={isSending || (!messageDraft.trim() && !attachmentFile)} aria-label="Send message">
                  <Send size={19} aria-hidden="true" />
                </button>
              </form>
              {attachmentFile || attachmentError ? <div className="message-attachment-draft">
                {attachmentFile ? <span>Attached: {attachmentFile.name} <button type="button" aria-label="Remove attachment" onClick={() => setAttachmentFile(null)}><X size={15} /></button></span> : null}
                {attachmentError ? <span className="speech-field-error" role="alert">{attachmentError}</span> : null}
                {attachmentFile ? <small>Checked by AI before sending. Maximum 4 MB.</small> : null}
              </div> : null}
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
      {deleteTarget ? <div className="community-modal-overlay" role="presentation" onMouseDown={() => !busyMessageId && setDeleteTarget(null)}>
        <div className="community-modal app-card" role="dialog" aria-modal="true" aria-labelledby="deleteMessageTitle" onMouseDown={(event) => event.stopPropagation()}>
          <h2 id="deleteMessageTitle" className="card-title">Delete message?</h2>
          <p className="card-copy">Everyone in this conversation will see “message deleted” in its place.</p>
          {messageActionError ? <p className="speech-field-error" role="alert">{messageActionError}</p> : null}
          <div className="button-row community-modal-actions">
            <button type="button" className="btn btn-secondary" disabled={Boolean(busyMessageId)} onClick={() => { setDeleteTarget(null); setMessageActionError(""); }}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={Boolean(busyMessageId)} onClick={() => void confirmMessageDelete()}>{busyMessageId ? "Deleting..." : "Delete message"}</button>
          </div>
        </div>
      </div> : null}
    </>
  );
};
