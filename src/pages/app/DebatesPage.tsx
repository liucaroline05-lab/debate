import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark,
  Check,
  Clock3,
  Eye,
  Lock,
  MessageCircle,
  Mic2,
  Play,
  Send,
  Share2,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { PageMeta } from "@/components/common/PageMeta";
import { seededDebates, seededMatchRequests } from "@/data/firestoreSeeds";
import {
  acceptOpenChallenge,
  addDebateComment,
  addDebateMessage,
  createOpenChallenge,
  createPrivateDebate,
  finalizeDebateIfComplete,
  incrementDebateShareCount,
  joinDebateByInviteCode,
  markDebateChatRead,
  submitDebateTurn,
  toggleDebateReaction,
} from "@/features/debates/debateService";
import { useAuth } from "@/features/auth/AuthContext";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import { formatDate, formatDateTime } from "@/lib/date";
import type {
  DebateComment,
  DebateChatRead,
  DebateMatchRequest,
  DebateMessage,
  DebateReaction,
  DebateThread,
  DebateTurn,
} from "@/types/models";

type DebateTab = "my-debates" | "open-challenges" | "spectate" | "completed";

const tabs: Array<{ id: DebateTab; label: string }> = [
  { id: "my-debates", label: "My Debates" },
  { id: "open-challenges", label: "Open Challenges" },
  { id: "spectate", label: "Spectate" },
  { id: "completed", label: "Completed" },
];

// Stable references so the seeded-collection hook does not re-subscribe.
const EMPTY_MESSAGES: DebateMessage[] = [];
const EMPTY_COMMENTS: DebateComment[] = [];
const EMPTY_REACTIONS: DebateReaction[] = [];
const EMPTY_CHAT_READS: DebateChatRead[] = [];

interface DebateFormatPreset {
  speechTimeLimit: string;
  rounds: number;
  summary: string;
  turns: Array<{ code: string; title: string; side: "Aff" | "Neg" }>;
}

const debateFormatPresets: Record<DebateMatchRequest["format"], DebateFormatPreset> = {
  "Lincoln-Douglas": {
    speechTimeLimit: "6 minutes",
    rounds: 5,
    summary: "AC 6m · NC 7m · 1AR 4m · NR 6m · 2AR 3m",
    turns: [
      { code: "AC", title: "Affirmative Constructive", side: "Aff" },
      { code: "NC", title: "Negative Constructive", side: "Neg" },
      { code: "1AR", title: "First Affirmative Rebuttal", side: "Aff" },
      { code: "NR", title: "Negative Rebuttal", side: "Neg" },
      { code: "2AR", title: "Second Affirmative Rebuttal", side: "Aff" },
    ],
  },
  "Public Forum": {
    speechTimeLimit: "4 minutes",
    rounds: 8,
    summary: "Constructives 4m · Rebuttals 4m · Summaries 3m · Final Focus 2m",
    turns: [
      { code: "A1", title: "Affirmative Constructive", side: "Aff" },
      { code: "N1", title: "Negative Constructive", side: "Neg" },
      { code: "A2", title: "Affirmative Rebuttal", side: "Aff" },
      { code: "N2", title: "Negative Rebuttal", side: "Neg" },
      { code: "AS", title: "Affirmative Summary", side: "Aff" },
      { code: "NS", title: "Negative Summary", side: "Neg" },
      { code: "AFF", title: "Affirmative Final Focus", side: "Aff" },
      { code: "NFF", title: "Negative Final Focus", side: "Neg" },
    ],
  },
  Policy: {
    speechTimeLimit: "8 minutes",
    rounds: 8,
    summary: "Constructives 8m · Rebuttals 5m",
    turns: [
      { code: "1AC", title: "First Affirmative Constructive", side: "Aff" },
      { code: "1NC", title: "First Negative Constructive", side: "Neg" },
      { code: "2AC", title: "Second Affirmative Constructive", side: "Aff" },
      { code: "2NC", title: "Second Negative Constructive", side: "Neg" },
      { code: "1NR", title: "First Negative Rebuttal", side: "Neg" },
      { code: "1AR", title: "First Affirmative Rebuttal", side: "Aff" },
      { code: "2NR", title: "Second Negative Rebuttal", side: "Neg" },
      { code: "2AR", title: "Second Affirmative Rebuttal", side: "Aff" },
    ],
  },
  "World Schools": {
    speechTimeLimit: "8 minutes",
    rounds: 8,
    summary: "Six substantive speeches 8m · Two replies 4m",
    turns: [
      { code: "A1", title: "First Proposition Speech", side: "Aff" },
      { code: "N1", title: "First Opposition Speech", side: "Neg" },
      { code: "A2", title: "Second Proposition Speech", side: "Aff" },
      { code: "N2", title: "Second Opposition Speech", side: "Neg" },
      { code: "A3", title: "Third Proposition Speech", side: "Aff" },
      { code: "N3", title: "Third Opposition Speech", side: "Neg" },
      { code: "NR", title: "Opposition Reply", side: "Neg" },
      { code: "AR", title: "Proposition Reply", side: "Aff" },
    ],
  },
};

const debateFormats = Object.keys(debateFormatPresets) as DebateMatchRequest["format"][];
const speechTimeLimits = [...new Set(Object.values(debateFormatPresets).map((preset) => preset.speechTimeLimit))];

const safeInitial = (value?: string | null) =>
  value?.trim()?.charAt(0).toUpperCase() || "D";

const isMyTurn = (debate: DebateThread, userId: string) =>
  debate.status === "Active" && debate.currentTurnUserId === userId;

// Newest-first for spectator/public comment threads.
const byNewest = <T extends { createdAt: string }>(a: T, b: T) =>
  b.createdAt.localeCompare(a.createdAt);

// Oldest-first for participant chat.
const byOldest = <T extends { createdAt: string }>(a: T, b: T) =>
  a.createdAt.localeCompare(b.createdAt);

const shortTime = (value: string) =>
  new Date(value).toLocaleString([], {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });

const DEFAULT_TURN_LABELS = [
  { code: "1AC", title: "Affirmative Constructive", side: "Aff" as const },
  { code: "1NC", title: "Negative Constructive", side: "Neg" as const },
  { code: "1AR", title: "Affirmative Rebuttal", side: "Aff" as const },
  { code: "2NR", title: "Negative Rebuttal", side: "Neg" as const },
];

const turnLabel = (format: string, index: number, turn?: DebateTurn) => {
  const preset = debateFormatPresets[format as DebateMatchRequest["format"]];
  const fallback = preset?.turns[index] ?? DEFAULT_TURN_LABELS[index] ?? {
    code: `${Math.floor(index / 2) + 1}${index % 2 === 0 ? "A" : "N"}`,
    title: `${index % 2 === 0 ? "Affirmative" : "Negative"} Speech`,
    side: index % 2 === 0 ? ("Aff" as const) : ("Neg" as const),
  };

  return {
    code: turn?.code ?? fallback.code,
    title: turn?.title ?? fallback.title,
    side: turn?.side ?? fallback.side,
  };
};

export const DebatesPage = () => {
  const { currentUser } = useAuth();
  if (!currentUser) {
    return null;
  }
  const user = currentUser;
  const userName = user.displayName?.trim() || "You";

  const [activeTab, setActiveTab] = useState<DebateTab>("my-debates");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [banner, setBanner] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [chatDebateId, setChatDebateId] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [expandedCommentsId, setExpandedCommentsId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [busyDebateId, setBusyDebateId] = useState<string | null>(null);
  const [sharedDebateId, setSharedDebateId] = useState<string | null>(null);
  const [debateForm, setDebateForm] = useState({
    topic: "",
    format: "Lincoln-Douglas" as DebateMatchRequest["format"],
    speechTimeLimit: debateFormatPresets["Lincoln-Douglas"].speechTimeLimit,
    visibility: "public" as "public" | "private",
    preferredSide: "Aff" as "Aff" | "Neg" | "Either",
    rounds: debateFormatPresets["Lincoln-Douglas"].rounds,
    responseWindowHours: 48,
    commentsEnabled: true,
  });

  const debateState = useSeededFirestoreCollection("debates", seededDebates);
  const matchState = useSeededFirestoreCollection("matchRequests", seededMatchRequests);
  const messageState = useSeededFirestoreCollection<DebateMessage>(
    "debateMessages",
    EMPTY_MESSAGES,
  );
  const commentState = useSeededFirestoreCollection<DebateComment>(
    "debateComments",
    EMPTY_COMMENTS,
  );
  const reactionState = useSeededFirestoreCollection<DebateReaction>(
    "debateReactions",
    EMPTY_REACTIONS,
  );
  const chatReadState = useSeededFirestoreCollection<DebateChatRead>(
    "debateChatReads",
    EMPTY_CHAT_READS,
  );

  const debates = useMemo(
    () => debateState.data.map((debate) => {
      const hasAllTurns =
        debate.status !== "Awaiting Opponent"
        && debate.totalRounds > 0
        && (debate.turns?.length ?? 0) >= debate.totalRounds;
      return hasAllTurns && debate.status !== "Completed"
        ? {
            ...debate,
            status: "Completed" as const,
            currentRound: debate.totalRounds,
            currentTurnUserId: null,
          }
        : debate;
    }),
    [debateState.data],
  );

  useEffect(() => {
    debateState.data.forEach((debate) => {
      const isStaleCompletedDebate =
        debate.status !== "Completed"
        && debate.status !== "Awaiting Opponent"
        && debate.totalRounds > 0
        && (debate.turns?.length ?? 0) >= debate.totalRounds;
      if (isStaleCompletedDebate) {
        void finalizeDebateIfComplete(debate).catch(() => {
          // The derived status still keeps the completed debate in the right tab.
        });
      }
    });
  }, [debateState.data]);

  const myReactions = useMemo(() => {
    const map = new Map<string, DebateReaction>();
    reactionState.data.forEach((reaction) => {
      if (reaction.userId === user.id) {
        map.set(reaction.debateId, reaction);
      }
    });
    return map;
  }, [reactionState.data, user.id]);

  const isParticipant = (debate: DebateThread) =>
    (debate.participantIds ?? []).includes(user.id);

  const myDebates = useMemo(() => {
    const rank = (debate: DebateThread) => {
      if (isMyTurn(debate, user.id)) return 0;
      if (debate.status === "Active") return 1;
      if (debate.status === "Awaiting Opponent") return 2;
      if (debate.status === "Completed") return 4;
      return 3;
    };

    return debates
      .filter(
        (debate) =>
          (debate.participantIds ?? []).includes(user.id) &&
          debate.status !== "Completed",
      )
      .sort((left, right) => {
        const byRank = rank(left) - rank(right);
        return byRank !== 0 ? byRank : left.nextDeadline.localeCompare(right.nextDeadline);
      });
  }, [debates, user.id]);

  const openChallenges = useMemo(
    () => matchState.data.filter((match) => match.status === "Open"),
    [matchState.data],
  );

  const spectateDebates = useMemo(
    () =>
      debates.filter(
        (debate) =>
          debate.visibility === "public" &&
          debate.status === "Active" &&
          !(debate.participantIds ?? []).includes(user.id),
      ),
    [debates, user.id],
  );

  const completedDebates = useMemo(
    () =>
      debates.filter(
        (debate) =>
          debate.status === "Completed" &&
          (debate.visibility === "public" ||
            (debate.participantIds ?? []).includes(user.id)),
      ),
    [debates, user.id],
  );

  const debateComments = (debateId: string) =>
    commentState.data.filter((comment) => comment.debateId === debateId);

  const debateMessages = (debateId: string) =>
    messageState.data.filter((message) => message.debateId === debateId);

  // Comment audience rules: off → nobody; active → spectators only; completed → everyone.
  const canViewComments = (debate: DebateThread) => {
    if (!debate.commentsEnabled) return false;
    if (debate.status === "Completed") return true;
    return !isParticipant(debate);
  };

  const resetForm = () => {
    setDebateForm({
      topic: "",
      format: "Lincoln-Douglas",
      speechTimeLimit: debateFormatPresets["Lincoln-Douglas"].speechTimeLimit,
      visibility: "public",
      preferredSide: "Aff",
      rounds: debateFormatPresets["Lincoln-Douglas"].rounds,
      responseWindowHours: 48,
      commentsEnabled: true,
    });
  };

  const submitNewDebate = async () => {
    if (!debateForm.topic.trim()) {
      setModalMessage("Add a debate topic before continuing.");
      return;
    }

    const shared = {
      topic: debateForm.topic,
      format: debateForm.format,
      creatorId: user.id,
      creatorName: userName,
      preferredSide: debateForm.preferredSide,
      rounds: debateForm.rounds,
      responseWindowHours: debateForm.responseWindowHours,
      speechTimeLimit: debateForm.speechTimeLimit,
      commentsEnabled: debateForm.commentsEnabled,
    };

    try {
      if (debateForm.visibility === "public") {
        await createOpenChallenge(shared);
        setBanner("Open challenge posted.");
        setActiveTab("open-challenges");
      } else {
        const { inviteCode } = await createPrivateDebate(shared);
        setInviteNotice(inviteCode);
        setActiveTab("my-debates");
      }
      setIsModalOpen(false);
      setModalMessage("");
      resetForm();
    } catch (error) {
      setModalMessage(
        error instanceof Error ? error.message : "Unable to create the debate.",
      );
    }
  };

  const submitJoinCode = async () => {
    if (!joinCode.trim()) {
      return;
    }

    try {
      await joinDebateByInviteCode(
        joinCode,
        { id: user.id, name: userName },
        debates,
      );
      setJoinCode("");
      setBanner("You joined the debate. It is now active.");
      setActiveTab("my-debates");
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Unable to join that debate.");
    }
  };

  const handleAccept = async (match: DebateMatchRequest) => {
    try {
      await acceptOpenChallenge(match, { id: user.id, name: userName });
      setBanner("Challenge accepted. The debate is now in My Debates.");
      setActiveTab("my-debates");
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Unable to accept challenge.");
    }
  };

  const handleTurnUpload = async (debate: DebateThread, file: File | undefined) => {
    if (!file) {
      return;
    }

    setBusyDebateId(debate.id);
    setBanner("");
    try {
      const result = await submitDebateTurn(
        debate,
        { id: user.id, name: userName },
        file,
      );
      if (result.completed) {
        setBanner("Final speech submitted. The debate is now complete.");
        setActiveTab("completed");
      } else {
        setBanner("Speech submitted. It is now your opponent's turn.");
      }
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Unable to upload the speech.");
    } finally {
      setBusyDebateId(null);
    }
  };

  const sendChatMessage = async (debateId: string) => {
    const content = chatDraft.trim();
    if (!content) {
      return;
    }

    try {
      await addDebateMessage(debateId, user.id, userName, content);
      setChatDraft("");
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Unable to send message.");
    }
  };

  const submitComment = async (debateId: string) => {
    const content = commentDrafts[debateId]?.trim();
    if (!content) {
      return;
    }

    try {
      await addDebateComment(debateId, user.id, userName, content);
      setCommentDrafts((current) => ({ ...current, [debateId]: "" }));
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Unable to add comment.");
    }
  };

  const handleShare = async (debate: DebateThread) => {
    const url = `${window.location.origin}/app/debates/${debate.id}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: debate.topic, url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setSharedDebateId(debate.id);
        window.setTimeout(
          () => setSharedDebateId((current) => (current === debate.id ? null : current)),
          2000,
        );
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setBanner("Unable to share this debate right now.");
      return;
    }

    void incrementDebateShareCount(debate.id, debate.shareCount).catch(() => {});
  };

  const renderMatchup = (debate: DebateThread, compact = false) => (
    <div className={compact ? "debate-matchup compact" : "debate-matchup"}>
      <div className="debater-card">
        <div className="debater-avatar">{safeInitial(debate.affirmative.name)}</div>
        <div>
          <strong>{debate.affirmative.name}</strong>
          <span className="debater-side is-aff">{debate.affirmative.label}</span>
        </div>
      </div>
      <div className="debate-vs">VS</div>
      <div className="debater-card is-right">
        <div>
          <strong>{debate.negative.name}</strong>
          <span className="debater-side is-neg">{debate.negative.label}</span>
        </div>
        <div className="debater-avatar is-neg">{safeInitial(debate.negative.name)}</div>
      </div>
    </div>
  );

  const renderReactions = (debate: DebateThread) => {
    const reaction = myReactions.get(debate.id);
    const liked = reaction?.like ?? false;
    const disliked = reaction?.dislike ?? false;
    const favorited = reaction?.favorite ?? false;
    const commentsOpen = expandedCommentsId === debate.id;
    const justShared = sharedDebateId === debate.id;

    return (
      <div className="forum-post-actions">
        <button
          type="button"
          className={liked ? "forum-action-button is-like" : "forum-action-button"}
          aria-pressed={liked}
          onClick={() => void toggleDebateReaction(debate.id, user.id, "like")}
        >
          <ThumbsUp size={16} /> {debate.likeCount ?? 0}
        </button>
        <button
          type="button"
          className={disliked ? "forum-action-button is-dislike" : "forum-action-button"}
          aria-pressed={disliked}
          onClick={() => void toggleDebateReaction(debate.id, user.id, "dislike")}
        >
          <ThumbsDown size={16} /> {debate.dislikeCount ?? 0}
        </button>
        <button
          type="button"
          className={favorited ? "forum-action-button is-favorite" : "forum-action-button"}
          aria-pressed={favorited}
          onClick={() => void toggleDebateReaction(debate.id, user.id, "favorite")}
        >
          <Bookmark size={16} /> {debate.favoriteCount ?? 0}
        </button>
        {debate.commentsEnabled ? (
          <button
            type="button"
            className={commentsOpen ? "forum-action-button is-comment" : "forum-action-button"}
            aria-pressed={commentsOpen}
            aria-label="Toggle comments"
            onClick={() => setExpandedCommentsId(commentsOpen ? null : debate.id)}
          >
            <MessageCircle size={16} /> {debate.commentCount ?? debateComments(debate.id).length}
          </button>
        ) : (
          <span className="forum-action-button is-disabled" aria-disabled="true">
            <MessageCircle size={16} /> Comments off
          </span>
        )}
        <button
          type="button"
          className={justShared ? "forum-action-button is-share" : "forum-action-button"}
          onClick={() => void handleShare(debate)}
        >
          {justShared ? <Check size={16} /> : <Share2 size={16} />}{" "}
          {justShared ? "Copied" : debate.shareCount ?? 0}
        </button>
      </div>
    );
  };

  const renderComments = (debate: DebateThread) => {
    if (expandedCommentsId !== debate.id || !canViewComments(debate)) {
      return null;
    }

    const comments = [...debateComments(debate.id)].sort(byNewest);
    const createLabel =
      debate.status === "Completed"
        ? "Add a comment"
        : "Add a spectator comment";

    return (
      <div className="forum-comments-panel">
        <div className="stack">
          {comments.length === 0 ? (
            <p className="meta-line">No comments yet. Start the discussion.</p>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="forum-comment-item">
                <strong>{comment.authorName}</strong>
                <span className="meta-line">{shortTime(comment.createdAt)}</span>
                <p className="card-copy">{comment.content}</p>
              </div>
            ))
          )}
        </div>

        <div className="forum-comment-form">
          <input
            aria-label={createLabel}
            value={commentDrafts[debate.id] ?? ""}
            onChange={(event) =>
              setCommentDrafts((current) => ({
                ...current,
                [debate.id]: event.target.value,
              }))
            }
            placeholder={`${createLabel}...`}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void submitComment(debate.id)}
          >
            Comment
          </button>
        </div>
      </div>
    );
  };

  const renderDebateTurns = (debate: DebateThread) => {
    if (debate.status === "Awaiting Opponent") {
      return (
        <div className="debate-awaiting-card">
          <div className="debate-awaiting-icon"><Clock3 size={20} /></div>
          <div>
            <strong>Waiting for an opponent to join</strong>
            <span className="meta-line">
              {debate.inviteCode ? <>Share invite code <strong>{debate.inviteCode}</strong></> : "Your challenge is ready to be accepted."}
            </span>
          </div>
        </div>
      );
    }

    if (debate.status === "Completed" && (debate.turns?.length ?? 0) === 0) {
      return (
        <div className="debate-completed-summary">
          <Check size={20} />
          <div>
            <strong>All speeches submitted</strong>
            <span className="meta-line">
              {debate.winner ? `${debate.winner === "Aff" ? "Affirmative" : "Negative"} won this debate.` : "This debate is ready to review."}
            </span>
          </div>
        </div>
      );
    }

    const visibleTurnCount = debate.status === "Completed"
      ? debate.turns.length
      : Math.max(debate.totalRounds, debate.turns?.length ?? 0);
    const busy = busyDebateId === debate.id;

    return (
      <div className="debate-entry-turns" aria-label="Debate speech sequence">
        {Array.from({ length: visibleTurnCount }, (_, index) => {
          const turn = debate.turns?.[index];
          const label = turnLabel(debate.format, index, turn);
          const isSubmitted = Boolean(turn);
          const isCurrent = !isSubmitted && debate.status === "Active" && index === (debate.turns?.length ?? 0);
          const isCurrentUser = isCurrent && isMyTurn(debate, user.id);
          const sideClass = label.side === "Aff" ? "is-aff" : "is-neg";

          return (
            <div
              key={turn?.id ?? `${debate.id}-turn-${index}`}
              className={`debate-entry-turn ${sideClass}${isCurrent ? " is-current" : ""}${!isSubmitted && !isCurrent ? " is-locked" : ""}`}
            >
              <span className={`turn-badge ${sideClass}`}>{label.side.toUpperCase()}</span>
              <div className="turn-main">
                <strong><span className="turn-code">{label.code}</span> — {label.title}</strong>
                {turn ? (
                  <span className="meta-line">
                    {turn.durationLabel ? `${turn.durationLabel} · ` : ""}
                    {turn.submittedAt ? `Submitted ${formatDateTime(turn.submittedAt)}` : turn.summary}
                  </span>
                ) : isCurrentUser ? (
                  <span className="meta-line is-current-copy">Your turn to respond · {debate.speechTimeLimit ?? "5 minutes"} time limit</span>
                ) : isCurrent ? (
                  <span className="meta-line">Waiting for {label.side === "Aff" ? debate.affirmative.name : debate.negative.name} to submit</span>
                ) : (
                  <span className="meta-line">Unlocks after the previous speech is submitted</span>
                )}
              </div>
              <div className="turn-actions">
                {turn?.speechUrl ? (
                  <a className={`debate-play-button ${sideClass}`} href={turn.speechUrl} target="_blank" rel="noreferrer" aria-label={`Play ${label.title}`}>
                    <Play size={17} fill="currentColor" />
                  </a>
                ) : isCurrentUser ? (
                  <label className="btn btn-primary debate-upload debate-record-button">
                    <Mic2 size={16} /> {busy ? "Uploading..." : "Record / Upload"}
                    <input
                      type="file"
                      accept="audio/*,video/*"
                      disabled={busy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        void handleTurnUpload(debate, file);
                      }}
                    />
                  </label>
                ) : (
                  <Lock className="debate-lock-icon" size={18} aria-label={isCurrent ? "Waiting" : "Locked"} />
                )}
                {isSubmitted ? <span className="debate-submitted-badge"><Check size={14} /> Submitted</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const activeChatDebate = chatDebateId
    ? debates.find((debate) => debate.id === chatDebateId)
    : undefined;

  const unreadChatCount = (debateId: string) => {
    const lastReadAt = chatReadState.data.find(
      (read) => read.debateId === debateId && read.userId === user.id,
    )?.lastReadAt ?? "";
    return debateMessages(debateId).filter(
      (message) => message.authorId !== user.id && message.createdAt > lastReadAt,
    ).length;
  };

  const activeUnreadCount = activeChatDebate ? unreadChatCount(activeChatDebate.id) : 0;
  useEffect(() => {
    if (!activeChatDebate || activeUnreadCount === 0) return;
    void markDebateChatRead(activeChatDebate.id, user.id);
  }, [activeChatDebate, activeUnreadCount, user.id]);

  return (
    <>
      <PageMeta
        title="Async Debate"
        description="Challenge opponents, upload turn speeches, chat with your opponent, and spectate public rounds."
      />

      <header className="route-header">
        <div className="row-between">
          <div>
            <p className="eyebrow">Async Debate</p>
            <h1>Challenge opponents and debate round by round.</h1>
            <p>
              Create open or invite-only debates, submit each turn as a speech,
              and follow public rounds as a spectator.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setModalMessage("");
              setIsModalOpen(true);
            }}
          >
            + New Debate
          </button>
        </div>
        <div className="debate-join-row">
          <input
            aria-label="Join with invite code"
            className="debate-invite-input"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
            placeholder="Have an invite code? Enter it to join"
          />
          <button type="button" className="btn btn-secondary" onClick={() => void submitJoinCode()}>
            Join
          </button>
        </div>
      </header>

      {isModalOpen ? (
        <section className="app-card debate-inline-composer composer-slide-down" aria-label="Create a new debate">
          <div className="row-between">
            <div>
              <p className="eyebrow">New async debate</p>
              <h2 className="card-title">Create a new debate</h2>
            </div>
            <button type="button" className="forum-icon-button" aria-label="Close debate form" onClick={() => setIsModalOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="form-grid" style={{ marginTop: "1rem" }}>
            <div className="form-field full">
              <label htmlFor="inlineDebateTopic">Topic</label>
              <input id="inlineDebateTopic" value={debateForm.topic} onChange={(event) => setDebateForm((current) => ({ ...current, topic: event.target.value }))} placeholder="Resolved: ..." autoFocus />
            </div>
            <div className="form-field">
              <label htmlFor="inlineDebateType">Debate type</label>
              <select
                id="inlineDebateType"
                value={debateForm.format}
                onChange={(event) => {
                  const format = event.target.value as DebateMatchRequest["format"];
                  const preset = debateFormatPresets[format];
                  setDebateForm((current) => ({
                    ...current,
                    format,
                    speechTimeLimit: preset.speechTimeLimit,
                    rounds: preset.rounds,
                  }));
                }}
              >
                {debateFormats.map((format) => <option key={format}>{format}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="inlineDebateTime">Format and limits</label>
              <input id="inlineDebateTime" value={debateFormatPresets[debateForm.format].summary} readOnly />
              <span className="meta-line">Sequence and speech limits are set automatically.</span>
            </div>
            <div className="form-field">
              <label htmlFor="inlineDebateVisibility">Visibility</label>
              <select id="inlineDebateVisibility" value={debateForm.visibility} onChange={(event) => setDebateForm((current) => ({ ...current, visibility: event.target.value as "public" | "private" }))}>
                <option value="public">Public — open challenge</option>
                <option value="private">Private — invite only</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="inlineDebateSide">Preferred side</label>
              <select id="inlineDebateSide" value={debateForm.preferredSide} onChange={(event) => setDebateForm((current) => ({ ...current, preferredSide: event.target.value as "Aff" | "Neg" | "Either" }))}>
                <option value="Aff">Affirmative</option><option value="Neg">Negative</option><option value="Either">Either side</option>
              </select>
            </div>
            <div className="debate-comment-control form-field full">
              <span>
                <strong>Spectator comments</strong>
                <span className="meta-line">Participants can read comments after the debate ends.</span>
              </span>
              <div className="settings-segment" role="group" aria-label="Spectator comments">
                <button
                  type="button"
                  className={debateForm.commentsEnabled ? "settings-segment-option is-on" : "settings-segment-option"}
                  aria-label="Comments on"
                  aria-pressed={debateForm.commentsEnabled}
                  onClick={() => setDebateForm((current) => ({ ...current, commentsEnabled: true }))}
                >
                  On
                </button>
                <button
                  type="button"
                  className={!debateForm.commentsEnabled ? "settings-segment-option is-on" : "settings-segment-option"}
                  aria-label="Comments off"
                  aria-pressed={!debateForm.commentsEnabled}
                  onClick={() => setDebateForm((current) => ({ ...current, commentsEnabled: false }))}
                >
                  Off
                </button>
              </div>
            </div>
          </div>
          <div className="forum-composer-footer">
            <span className="meta-line">{modalMessage || (debateForm.visibility === "private" ? "A shareable invite code is generated when you create the debate." : "Your debate will appear in Open Challenges.")}</span>
            <div className="button-row">
              <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={() => void submitNewDebate()}>Create Debate</button>
            </div>
          </div>
        </section>
      ) : null}

      {banner ? (
        <div className="debate-banner" role="status">
          {banner}
          <button type="button" className="forum-icon-button" aria-label="Dismiss" onClick={() => setBanner("")}>
            <X size={16} />
          </button>
        </div>
      ) : null}

      {inviteNotice ? (
        <div className="debate-banner is-invite" role="status">
          Private debate created. Share this invite code: <strong>{inviteNotice}</strong>
          <button
            type="button"
            className="forum-icon-button"
            aria-label="Dismiss invite code"
            onClick={() => setInviteNotice(null)}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      <div className="debate-tabs" role="tablist" aria-label="Async debate sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "debate-tab is-active" : "debate-tab"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "my-debates" ? (
        <section className="stack">
          {myDebates.length > 0 ? (
            myDebates.map((debate) => (
              <article key={debate.id} className="debate-panel">
                <div className="debate-panel-header">
                  <div className="cluster">
                    <span className={isMyTurn(debate, user.id) ? "debate-dot is-live" : "debate-dot"} />
                    <h2 className="debate-topic">{debate.topic}</h2>
                    <span className="pill debate-format-pill">{debate.format}</span>
                  </div>
                  <div className="debate-entry-status">
                    <span className={`debate-status-badge${isMyTurn(debate, user.id) ? " is-current" : debate.status === "Completed" ? " is-complete" : ""}`}>
                      {isMyTurn(debate, user.id) ? "Your turn — reply" : debate.status === "Active" ? "Waiting on opponent" : debate.status}
                    </span>
                    <span className="meta-line">Round {debate.currentRound} of {debate.totalRounds}</span>
                  </div>
                </div>

                {renderMatchup(debate)}
                {renderDebateTurns(debate)}

                <div className="debate-entry-footer">
                  <div className="debate-entry-meta">
                    <span><Clock3 size={15} /> Deadline {formatDateTime(debate.nextDeadline)}</span>
                    <span><Eye size={15} /> {debate.spectators} spectators</span>
                  </div>
                  <div className="button-row">
                    {(debate.participantIds?.length ?? 0) > 1 ? (
                      <button type="button" className="btn btn-ghost debate-chat-button" onClick={() => setChatDebateId(debate.id)}>
                        <MessageCircle size={16} /> Chat
                        {unreadChatCount(debate.id) > 0 ? (
                          <span className="debate-chat-badge" aria-label={`${unreadChatCount(debate.id)} unread messages`}>
                            {unreadChatCount(debate.id) > 99 ? "99+" : unreadChatCount(debate.id)}
                          </span>
                        ) : null}
                      </button>
                    ) : null}
                    <Link className="btn btn-secondary" to={`/app/debates/${debate.id}`}>
                      {debate.status === "Completed" ? "Review debate" : "View debate"}
                    </Link>
                  </div>
                </div>

                {canViewComments(debate) ? (
                  <>
                    {renderReactions(debate)}
                    {renderComments(debate)}
                  </>
                ) : null}
              </article>
            ))
          ) : (
            <div className="empty-state">
              <h2 className="card-title">You have no debates yet</h2>
              <p className="card-copy">
                Start one with <strong>+ New Debate</strong>, accept an open challenge,
                or spectate a public round.
              </p>
              <div className="button-row" style={{ justifyContent: "center" }}>
                <button type="button" className="btn btn-primary" onClick={() => setActiveTab("open-challenges")}>
                  Browse Open Challenges
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setActiveTab("spectate")}>
                  Spectate Debates
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "open-challenges" ? (
        <section className="stack">
          {openChallenges.length > 0 ? (
            openChallenges.map((match) => {
              const isOwnChallenge = (match.creatorId ?? match.requestedBy) === user.id;

              return (
                <article key={match.id} className="debate-panel is-challenge">
                  <div className="debate-panel-header">
                    <div className="cluster">
                      <span className="debate-dot is-warm" />
                      <h2 className="debate-topic">{match.topic}</h2>
                      <span className="pill debate-format-pill">{match.format}</span>
                    </div>
                    <span className="debate-status-badge is-open">Open Challenge</span>
                  </div>

                  <div className="challenge-body">
                    <div className="debater-card">
                      <div className="debater-avatar">{safeInitial(match.requestedBy)}</div>
                      <div>
                        <strong>{match.requestedBy}</strong>
                        <span className="meta-line">
                          Wants to debate as{" "}
                          <span className="debater-side is-aff">
                            {match.requesterSideLabel ?? match.preferredSide}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="challenge-meta">
                      <strong>{match.requesterGoal ?? "Looking for a partner"}</strong>
                      <span className="meta-line">
                        {match.rounds ?? 4} rounds • {match.responseWindowHours ?? 48}h per round
                        {match.speechTimeLimit ? ` • ${match.speechTimeLimit}` : ""}
                      </span>
                    </div>

                    <div className="challenge-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={isOwnChallenge}
                        onClick={() => void handleAccept(match)}
                      >
                        {isOwnChallenge ? "Your challenge" : "Accept Challenge"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="empty-state">
              <h2 className="card-title">No open challenges right now</h2>
              <p className="card-copy">Post one with + New Debate and set it to public.</p>
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "spectate" ? (
        <section className="stack">
          {spectateDebates.length > 0 ? (
            spectateDebates.map((debate) => (
              <article key={debate.id} className="debate-panel is-spectate">
                <div className="debate-panel-header">
                  <div className="cluster">
                    <span className="debate-dot is-sage" />
                    <h2 className="debate-topic">{debate.topic}</h2>
                    <span className="pill debate-format-pill">{debate.format}</span>
                  </div>
                  <span className="debate-status-badge">{debate.spectators} watching</span>
                </div>

                {renderMatchup(debate, true)}

                <div className="debate-panel-footer">
                  <span className="meta-line">
                    Round {debate.currentRound} of {debate.totalRounds} • Next deadline{" "}
                    {formatDateTime(debate.nextDeadline)}
                  </span>
                  <Link className="btn btn-secondary" to={`/app/debates/${debate.id}`}>
                    Watch Debate
                  </Link>
                </div>

                {renderReactions(debate)}
                {renderComments(debate)}
              </article>
            ))
          ) : (
            <div className="empty-state">
              <h2 className="card-title">No spectator debates yet</h2>
              <p className="card-copy">
                Public active rounds where you are not a participant will appear here.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "completed" ? (
        <section className="stack">
          {completedDebates.length > 0 ? (
            completedDebates.map((debate) => (
              <article key={debate.id} className="debate-panel">
                <div className="debate-panel-header">
                  <div className="cluster">
                    <span className="debate-dot" />
                    <h2 className="debate-topic">{debate.topic}</h2>
                    <span className="pill debate-format-pill">{debate.format}</span>
                  </div>
                  <span className="debate-status-badge is-complete">
                    Completed {debate.aiJudged ? "• AI Judged" : ""}
                  </span>
                </div>

                <div className="debate-scoreboard">
                  <div className="debater-card">
                    <div className="debater-avatar">{safeInitial(debate.affirmative.name)}</div>
                    <div>
                      <strong>{debate.affirmative.name}</strong>
                      <span className="debater-side is-aff">{debate.affirmative.label}</span>
                    </div>
                  </div>

                  <div className="score-pill">
                    <strong className="score aff">{debate.score?.aff ?? "--"}</strong>
                    <span className="score-winner">
                      {debate.winner === "Aff" ? "AFF WINS" : debate.winner === "Neg" ? "NEG WINS" : "FINAL"}
                    </span>
                    <strong className="score neg">{debate.score?.neg ?? "--"}</strong>
                  </div>

                  <div className="debater-card is-right">
                    <div>
                      <strong>{debate.negative.name}</strong>
                      <span className="debater-side is-neg">{debate.negative.label}</span>
                    </div>
                    <div className="debater-avatar is-neg">{safeInitial(debate.negative.name)}</div>
                  </div>
                </div>

                <div className="debate-panel-footer">
                  <span className="meta-line">
                    {debate.totalRounds} rounds • {formatDate(debate.nextDeadline)} • {debate.spectators} spectators
                  </span>
                  <div className="button-row">
                    <Link className="btn btn-secondary" to={`/app/debates/${debate.id}`}>
                      View Debate
                    </Link>
                    <Link className="btn btn-ghost" to={`/app/debates/${debate.id}?view=summary`}>
                      View Summary
                    </Link>
                  </div>
                </div>

                {renderReactions(debate)}
                {renderComments(debate)}
              </article>
            ))
          ) : (
            <div className="empty-state">
              <h2 className="card-title">No completed debates yet</h2>
              <p className="card-copy">Finished rounds you can review will appear here.</p>
            </div>
          )}
        </section>
      ) : null}

      {false && isModalOpen ? (
        <div className="debate-modal-overlay" role="dialog" aria-modal="true" aria-label="Create a new debate">
          <div className="debate-modal">
            <div className="row-between">
              <h2 className="card-title">Create a new debate</h2>
              <button type="button" className="forum-icon-button" aria-label="Close" onClick={() => setIsModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="form-grid" style={{ marginTop: "1rem" }}>
              <div className="form-field full">
                <label htmlFor="debateTopic">Topic</label>
                <input
                  id="debateTopic"
                  value={debateForm.topic}
                  onChange={(event) =>
                    setDebateForm((current) => ({ ...current, topic: event.target.value }))
                  }
                  placeholder="Resolved: ..."
                />
              </div>

              <div className="form-field">
                <label htmlFor="debateType">Debate type</label>
                <select
                  id="debateType"
                  value={debateForm.format}
                  onChange={(event) =>
                    setDebateForm((current) => ({
                      ...current,
                      format: event.target.value as DebateMatchRequest["format"],
                    }))
                  }
                >
                  {debateFormats.map((format) => (
                    <option key={format} value={format}>
                      {format}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="debateTime">Speech time limit</label>
                <select
                  id="debateTime"
                  value={debateForm.speechTimeLimit}
                  onChange={(event) =>
                    setDebateForm((current) => ({
                      ...current,
                      speechTimeLimit: event.target.value,
                    }))
                  }
                >
                  {speechTimeLimits.map((limit) => (
                    <option key={limit} value={limit}>
                      {limit}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="debateVisibility">Visibility</label>
                <select
                  id="debateVisibility"
                  value={debateForm.visibility}
                  onChange={(event) =>
                    setDebateForm((current) => ({
                      ...current,
                      visibility: event.target.value as "public" | "private",
                    }))
                  }
                >
                  <option value="public">Public — open challenge</option>
                  <option value="private">Private — invite only</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="debateSide">Preferred side</label>
                <select
                  id="debateSide"
                  value={debateForm.preferredSide}
                  onChange={(event) =>
                    setDebateForm((current) => ({
                      ...current,
                      preferredSide: event.target.value as "Aff" | "Neg" | "Either",
                    }))
                  }
                >
                  <option value="Aff">Affirmative</option>
                  <option value="Neg">Negative</option>
                  <option value="Either">Either side</option>
                </select>
              </div>

              <div className="form-field full">
                <label className="debate-toggle" htmlFor="debateComments">
                  <input
                    id="debateComments"
                    type="checkbox"
                    checked={debateForm.commentsEnabled}
                    onChange={(event) =>
                      setDebateForm((current) => ({
                        ...current,
                        commentsEnabled: event.target.checked,
                      }))
                    }
                  />
                  Allow spectator comments
                </label>
                <span className="meta-line">
                  {debateForm.visibility === "private"
                    ? "A private debate stays invite-only until someone joins with the code."
                    : "A public debate is posted as an open challenge anyone can accept."}
                </span>
              </div>
            </div>

            <div className="forum-composer-footer">
              {modalMessage ? <span className="meta-line">{modalMessage}</span> : <span className="meta-line" />}
              <div className="button-row">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void submitNewDebate()}>
                  Create Debate
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeChatDebate ? (
        <div className="debate-chat-overlay" role="dialog" aria-modal="true" aria-label="Debate chat">
          <div className="debate-chat-drawer">
            <div className="row-between debate-chat-header">
              <div>
                <strong>Chat</strong>
                <span className="meta-line">{activeChatDebate.topic}</span>
              </div>
              <button type="button" className="forum-icon-button" aria-label="Close chat" onClick={() => setChatDebateId(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="debate-chat-messages">
              {debateMessages(activeChatDebate.id).length === 0 ? (
                <p className="meta-line">No messages yet. Say hello to your opponent.</p>
              ) : (
                [...debateMessages(activeChatDebate.id)].sort(byOldest).map((message) => (
                  <div
                    key={message.id}
                    className={
                      message.authorId === user.id
                        ? "debate-chat-message is-mine"
                        : "debate-chat-message"
                    }
                  >
                    <span className="meta-line">
                      {message.authorName} • {shortTime(message.createdAt)}
                    </span>
                    <p className="card-copy">{message.content}</p>
                  </div>
                ))
              )}
            </div>

            <div className="forum-comment-form">
              <input
                aria-label="Message your opponent"
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                placeholder="Message your opponent..."
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void sendChatMessage(activeChatDebate.id);
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-primary"
                aria-label="Send message"
                onClick={() => void sendChatMessage(activeChatDebate.id)}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
