import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark,
  Check,
  Lock,
  MessageCircle,
  Send,
  Share2,
  ThumbsDown,
  ThumbsUp,
  Upload,
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
  incrementDebateShareCount,
  joinDebateByInviteCode,
  submitDebateTurn,
  toggleDebateReaction,
} from "@/features/debates/debateService";
import { useAuth } from "@/features/auth/AuthContext";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import { formatDate, formatDateTime } from "@/lib/date";
import type {
  DebateComment,
  DebateMatchRequest,
  DebateMessage,
  DebateReaction,
  DebateThread,
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

const debateFormats: DebateMatchRequest["format"][] = [
  "Lincoln-Douglas",
  "Public Forum",
  "Policy",
  "Async",
];

const speechTimeLimits = ["3 minutes", "4 minutes", "5 minutes", "6 minutes", "8 minutes"];

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
    speechTimeLimit: "5 minutes",
    visibility: "public" as "public" | "private",
    preferredSide: "Aff" as "Aff" | "Neg" | "Either",
    rounds: 4,
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

    return debateState.data
      .filter((debate) => (debate.participantIds ?? []).includes(user.id))
      .sort((left, right) => {
        const byRank = rank(left) - rank(right);
        return byRank !== 0 ? byRank : left.nextDeadline.localeCompare(right.nextDeadline);
      });
  }, [debateState.data, user.id]);

  const openChallenges = useMemo(
    () => matchState.data.filter((match) => match.status === "Open"),
    [matchState.data],
  );

  const spectateDebates = useMemo(
    () =>
      debateState.data.filter(
        (debate) =>
          debate.visibility === "public" &&
          debate.status === "Active" &&
          !(debate.participantIds ?? []).includes(user.id),
      ),
    [debateState.data, user.id],
  );

  const completedDebates = useMemo(
    () =>
      debateState.data.filter(
        (debate) =>
          debate.status === "Completed" &&
          (debate.visibility === "public" ||
            (debate.participantIds ?? []).includes(user.id)),
      ),
    [debateState.data, user.id],
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

  const latestOpponentSpeech = (debate: DebateThread) =>
    [...(debate.turns ?? [])]
      .reverse()
      .find((turn) => turn.authorId !== user.id && Boolean(turn.speechUrl));

  const resetForm = () => {
    setDebateForm({
      topic: "",
      format: "Lincoln-Douglas",
      speechTimeLimit: "5 minutes",
      visibility: "public",
      preferredSide: "Aff",
      rounds: 4,
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
        debateState.data,
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
      await submitDebateTurn(debate, { id: user.id, name: userName }, file);
      setBanner("Speech submitted. It is now your opponent's turn.");
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

  const renderMyDebateAction = (debate: DebateThread) => {
    if (debate.status === "Awaiting Opponent") {
      return (
        <div className="debate-turn-action is-waiting">
          <span className="debate-status-badge">Awaiting opponent</span>
          {debate.inviteCode ? (
            <span className="meta-line">
              Invite code: <strong>{debate.inviteCode}</strong>
            </span>
          ) : null}
        </div>
      );
    }

    if (debate.status === "Completed") {
      return (
        <div className="debate-turn-action">
          <span className="debate-status-badge is-complete">
            Completed{debate.winner ? ` • ${debate.winner} won` : ""}
          </span>
          <Link className="btn btn-ghost" to={`/app/debates/${debate.id}`}>
            Review debate
          </Link>
        </div>
      );
    }

    if (isMyTurn(debate, user.id)) {
      const opponentSpeech = latestOpponentSpeech(debate);
      const busy = busyDebateId === debate.id;

      return (
        <div className="debate-turn-action is-your-turn">
          <span className="debate-status-badge is-current">Your turn — reply</span>
          {opponentSpeech ? (
            <div className="debate-speech-player">
              <span className="meta-line">Latest opponent speech</span>
              <audio controls preload="none" src={opponentSpeech.speechUrl} />
              <a href={opponentSpeech.speechUrl} target="_blank" rel="noreferrer">
                Open speech
              </a>
            </div>
          ) : (
            <span className="meta-line">No opponent speech yet — you may open.</span>
          )}
          <label className="btn btn-primary debate-upload">
            <Upload size={16} /> {busy ? "Uploading..." : "Upload your speech"}
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
        </div>
      );
    }

    return (
      <div className="debate-turn-action is-waiting">
        <span className="debate-status-badge">Waiting on opponent</span>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setChatDebateId(debate.id)}
        >
          <MessageCircle size={16} /> Chat
        </button>
      </div>
    );
  };

  const activeChatDebate = chatDebateId
    ? debateState.data.find((debate) => debate.id === chatDebateId)
    : undefined;

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
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
            placeholder="Have an invite code? Enter it to join"
          />
          <button type="button" className="btn btn-secondary" onClick={() => void submitJoinCode()}>
            Join
          </button>
        </div>
      </header>

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
                  <span className="meta-line">
                    Round {debate.currentRound} of {debate.totalRounds}
                  </span>
                </div>

                {renderMatchup(debate)}
                {renderMyDebateAction(debate)}

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
                  <Link className="btn btn-secondary" to={`/app/debates/${debate.id}`}>
                    View Full Debate
                  </Link>
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

      {isModalOpen ? (
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
