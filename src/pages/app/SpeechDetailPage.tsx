import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { doc, onSnapshot, where, type QueryConstraint } from "firebase/firestore";
import {
  Download,
  Bookmark,
  FileAudio,
  Flag,
  MoreHorizontal,
  Pencil,
  Share2,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { PageMeta } from "@/components/common/PageMeta";
import { SpeechMediaPlayer } from "@/components/speeches/SpeechMediaPlayer";
import { useAuth } from "@/features/auth/AuthContext";
import { ShareToMessageDialog } from "@/features/messages/ShareToMessageDialog";
import {
  deleteSpeechRecord,
  grantPrivateSpeechAccess,
  addSpeechComment,
  reportSpeechRecord,
  retrySpeechSummary,
  toggleSpeechSave,
  toggleSpeechCommentReaction,
  updateSpeechRecord,
} from "@/features/speeches/speechService";
import { formatDateTime } from "@/lib/date";
import { speechFormatGroups } from "@/lib/speechFormats";
import { speechTopicCategories } from "@/lib/speechTopics";
import { firestore } from "@/lib/firebase";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type {
  SpeechComment,
  SpeechCommentReaction,
  SpeechRecord,
  SpeechSave,
  SpeechSummaryStatus,
} from "@/types/models";

const EMPTY_SPEECH_COMMENTS: SpeechComment[] = [];
const EMPTY_SPEECH_COMMENT_REACTIONS: SpeechCommentReaction[] = [];
const EMPTY_SPEECH_SAVES: SpeechSave[] = [];

const summaryStatusCopy: Record<SpeechSummaryStatus, string> = {
  processing: "This recording is being transcribed and summarized. Check back shortly.",
  completed: "The AI summary is ready.",
  failed:
    "The AI summary could not be generated for this recording. An administrator can check the function logs and retry.",
};

const EmptySummaryList = () => (
  <p className="meta-line">Nothing in the transcript supported this section.</p>
);

const SummaryList = ({ title, items }: { title: string; items: string[] }) => (
  <section className="speech-summary-section">
    <h3>{title}</h3>
    {items.length > 0 ? (
      <ul>
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    ) : (
      <EmptySummaryList />
    )}
  </section>
);

const toFormState = (speech: SpeechRecord) => ({
  title: speech.title,
  eventName: speech.eventName,
  format: speech.format,
  topicCategory: speech.topicCategory ?? "Other",
  visibility: speech.visibility ?? "private",
  speakerName: speech.speakerName,
  coachNotes: speech.coachNotes,
  tags: speech.tags.join(", "),
  organizationTags: speech.organizationTags.join(", "),
  commentsEnabled: speech.commentsEnabled ?? true,
});

const getSpeechFileName = (speech: SpeechRecord) => {
  if (!speech.mediaPath) {
    return "No recording attached";
  }

  try {
    const path = new URL(speech.mediaPath).pathname;
    const encodedFileName = path.split("/o/")[1]?.split("?")[0];
    const decodedPath = encodedFileName ? decodeURIComponent(encodedFileName) : "";
    return decodedPath.split("/").pop() || "Speech recording";
  } catch {
    return "Speech recording";
  }
};

export const SpeechDetailPage = () => {
  const { speechId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser } = useAuth();
  const [speech, setSpeech] = useState<SpeechRecord | null>(null);
  const [form, setForm] = useState<ReturnType<typeof toFormState> | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(firestore && speechId));
  const [isSaving, setIsSaving] = useState(false);
  const [isRetryingSummary, setIsRetryingSummary] = useState(false);
  const [summaryRetryNotice, setSummaryRetryNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [isSaveBusy, setIsSaveBusy] = useState(false);
  const [optimisticSave, setOptimisticSave] = useState<boolean | null>(null);
  const saveConstraints = useMemo<QueryConstraint[]>(
    () => currentUser ? [where("userId", "==", currentUser.id)] : [],
    [currentUser?.id],
  );
  const savesState = useSeededFirestoreCollection<SpeechSave>(
    "speechSaves", EMPTY_SPEECH_SAVES, saveConstraints, Boolean(currentUser),
    currentUser ? `speech-saves:${currentUser.id}` : undefined,
  );
  const [isReportOpen, setIsReportOpen] = useState(searchParams.get("report") === "1");
  const [reportReason, setReportReason] = useState<"Harassment" | "Inappropriate content" | "Spam" | "Copyright" | "Other">("Inappropriate content");
  const [reportDetails, setReportDetails] = useState("");
  const [reportNotice, setReportNotice] = useState("");
  const [reportError, setReportError] = useState("");
  const [isReporting, setIsReporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const commentsState = useSeededFirestoreCollection<SpeechComment>(
    "speechComments",
    EMPTY_SPEECH_COMMENTS,
  );
  const commentReactionState = useSeededFirestoreCollection<SpeechCommentReaction>(
    "speechCommentReactions",
    EMPTY_SPEECH_COMMENT_REACTIONS,
  );
  const [commentVoteOverrides, setCommentVoteOverrides] = useState<
    Record<string, { like: boolean; dislike: boolean }>
  >({});

  const myCommentVotes = useMemo(() => {
    const map = new Map<string, { like: boolean; dislike: boolean }>();
    commentReactionState.data.forEach((reaction) => {
      if (reaction.userId === currentUser?.id) {
        map.set(reaction.commentId, {
          like: Boolean(reaction.like),
          dislike: Boolean(reaction.dislike),
        });
      }
    });
    return map;
  }, [commentReactionState.data, currentUser?.id]);

  const getMyCommentVote = (commentId: string) =>
    commentVoteOverrides[commentId]
    ?? myCommentVotes.get(commentId)
    ?? { like: false, dislike: false };

  const isOwner = Boolean(speech?.creatorId && speech.creatorId === currentUser?.id);
  const isSaved = optimisticSave ?? savesState.data.some((save) => save.speechId === speechId);
  const isEditing = isOwner && searchParams.get("mode") === "edit";

  useEffect(() => {
    if (!firestore || !speechId) {
      setIsLoading(false);
      setError("Firebase is not configured.");
      return;
    }

    const unsubscribe = onSnapshot(
      doc(firestore, "speeches", speechId),
      (snapshot) => {
        const nextSpeech = snapshot.exists()
          ? ({ id: snapshot.id, ...snapshot.data() } as SpeechRecord)
          : null;

        setSpeech(nextSpeech);
        setForm(nextSpeech ? toFormState(nextSpeech) : null);
        setError(null);
        setIsLoading(false);
      },
      (snapshotError) => {
        setSpeech(null);
        setForm(null);
        setError(snapshotError.message);
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, [speechId]);

  useEffect(() => {
    setCommentVoteOverrides((current) => {
      let next = current;
      Object.entries(current).forEach(([commentId, override]) => {
        const persisted = myCommentVotes.get(commentId);
        if (!persisted) return;
        if (persisted.like === override.like && persisted.dislike === override.dislike) {
          if (next === current) next = { ...current };
          delete next[commentId];
        }
      });
      return next;
    });
  }, [myCommentVotes]);

  const closeEditMode = () => {
    setSearchParams({});
    setMessage("");
    if (speech) {
      setForm(toFormState(speech));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!speech || !form || !isOwner) {
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      await updateSpeechRecord(speech.id, {
        ...form,
        tags: form.tags.split(",").map((item) => item.trim()).filter(Boolean),
        organizationTags: form.organizationTags
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setSearchParams({});
      setMessage("Speech updated.");
    } catch (saveError) {
      setMessage(
        saveError instanceof Error ? saveError.message : "Unable to update speech.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!speech || !isOwner || !window.confirm("Delete this speech?")) {
      return;
    }

    await deleteSpeechRecord(speech.id);
    navigate("/app/dashboard", { replace: true });
  };

  const handleReport = async () => {
    if (!speech || !currentUser || isOwner || isReporting) return;
    setReportError("");
    setIsReporting(true);
    try {
      const created = await reportSpeechRecord(
        speech.id,
        currentUser.id,
        reportReason,
        reportDetails,
      );
      setReportNotice(created ? "Report submitted. Thank you." : "You have already reported this speech.");
      setIsReportOpen(false);
      setReportDetails("");
    } catch (reportFailure) {
      setReportError(reportFailure instanceof Error ? reportFailure.message : "Unable to submit report.");
    } finally {
      setIsReporting(false);
    }
  };

  const handleRetrySummary = async () => {
    if (!speech || !isOwner || isRetryingSummary) return;
    setIsRetryingSummary(true);
    setSummaryRetryNotice("");
    try {
      const status = await retrySpeechSummary(speech.id);
      setSummaryRetryNotice(status === "completed"
        ? "AI summary is ready."
        : status === "failed"
          ? "The retry failed. Check the summary error or try again later."
          : "The summary is being processed. This page will update automatically.");
    } catch (retryError) {
      setSummaryRetryNotice(
        retryError instanceof Error ? retryError.message : "Unable to retry the summary.",
      );
    } finally {
      setIsRetryingSummary(false);
    }
  };

  const voteOnComment = async (
    comment: SpeechComment,
    reaction: "like" | "dislike",
  ) => {
    if (!currentUser) {
      setMessage("Sign in to react to feedback.");
      return;
    }

    const previous = getMyCommentVote(comment.id);
    const next = { ...previous };
    if (reaction === "like") {
      next.like = !next.like;
      if (next.like) next.dislike = false;
    } else {
      next.dislike = !next.dislike;
      if (next.dislike) next.like = false;
    }

    setCommentVoteOverrides((current) => ({ ...current, [comment.id]: next }));
    try {
      await toggleSpeechCommentReaction(
        comment.id,
        comment.speechId,
        currentUser.id,
        reaction,
      );
    } catch (error) {
      setCommentVoteOverrides((current) => {
        const restored = { ...current };
        delete restored[comment.id];
        return restored;
      });
      setMessage(error instanceof Error ? error.message : "Unable to save that vote.");
    }
  };

  const submitComment = async () => {
    if (!speech || !currentUser || !commentDraft.trim()) return;
    try {
      await addSpeechComment(
        speech.id,
        currentUser.id,
        currentUser.displayName?.trim() || "Debater",
        commentDraft,
      );
      setCommentDraft("");
    } catch (commentError) {
      setMessage(commentError instanceof Error ? commentError.message : "Unable to add comment.");
    }
  };

  if (isLoading) {
    return (
      <section className="empty-state">
        <h2 className="card-title">Loading speech</h2>
        <p className="card-copy">Pulling this recording from Firebase.</p>
      </section>
    );
  }

  if (!speech || !form) {
    return (
      <section className="empty-state">
        <h2 className="card-title">Speech not found</h2>
        <p className="card-copy">
          {error ?? "This speech record is not available in Firebase yet."}
        </p>
      </section>
    );
  }

  const fileName = getSpeechFileName(speech);
  const aiSummary = speech.aiSummary;
  const canRetrySummary = isOwner && Boolean(speech.mediaStoragePath || speech.mediaPath)
    && (speech.summaryStatus === "failed"
      || (speech.summaryStatus === "processing"
        && Date.now() - new Date(speech.uploadedAt).getTime() >= 10 * 60 * 1000));

  return (
    <>
      <PageMeta
        title={speech.title}
        description={`Review transcript state, event metadata, and feedback for ${speech.title}.`}
      />
      <header className="route-header speech-detail-header">
        <div>
          <p className="eyebrow">Speech detail</p>
          <h1>{speech.title}</h1>
          <p>
            {speech.format} • {speech.eventName} • Uploaded {formatDateTime(speech.uploadedAt)}
          </p>
        </div>
        <div className="button-row">
          {currentUser ? <button type="button" className="btn btn-toggle" aria-pressed={isSaved} disabled={isSaveBusy} onClick={async () => {
            if (!speechId) return;
            const next = !isSaved;
            setOptimisticSave(next);
            setIsSaveBusy(true);
            try {
              await toggleSpeechSave(speechId, currentUser.id, isSaved);
            } catch (cause) {
              setOptimisticSave(null);
              setError(cause instanceof Error ? cause.message : "Unable to update saved speeches.");
            } finally {
              setIsSaveBusy(false);
            }
          }}><Bookmark size={16} aria-hidden="true" /> {isSaved ? "Saved" : "Save"}</button> : null}
          {(speech.visibility === "public" || isOwner) ? (
            <button type="button" className="btn btn-secondary" onClick={() => setShareOpen(true)}>
              <Share2 size={16} aria-hidden="true" /> Share
            </button>
          ) : null}
          <div className="forum-post-menu">
            <button
              type="button"
              className="forum-icon-button"
              aria-label={`Actions for ${speech.title}`}
              onClick={() => setMenuOpen((current) => !current)}
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen ? (
              <div className="forum-menu-dropdown">
                {isOwner ? (
                  <>
                    <button
                      type="button"
                      className="forum-menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        setSearchParams({ mode: "edit" });
                      }}
                    >
                      <Pencil size={16} /> Edit
                    </button>
                    <button
                      type="button"
                      className="forum-menu-item"
                      onClick={() => void handleDelete()}
                    >
                      <Trash2 size={16} /> Delete
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="forum-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      setReportError("");
                      setIsReportOpen(true);
                    }}
                  >
                    <Flag size={16} /> Report
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {reportNotice ? <p className="speech-detail-notice" role="status">{reportNotice}</p> : null}

      <section className="speech-detail-stack">
        <article className="app-card speech-playback-card">
          <h2 className="card-title">Speech playback</h2>
          <div className="speech-player-shell">
            <div className="speech-file-row">
              <div className="speech-file-icon">
                <FileAudio size={26} />
              </div>
              <div>
                <strong>{fileName}</strong>
                <span className="meta-line">
                  Uploaded {formatDateTime(speech.uploadedAt)}
                </span>
              </div>
            </div>
            <div className="speech-player-divider" />
            {speech.mediaPath ? (
              <div className="speech-playback-controls">
                <SpeechMediaPlayer
                  src={speech.mediaPath}
                  fileName={fileName}
                  contentType={speech.mediaContentType}
                />
                <a
                  className="btn btn-secondary"
                  href={speech.mediaPath}
                  download={fileName}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={16} /> Download
                </a>
              </div>
            ) : (
              <p className="card-copy">No recording is attached to this speech.</p>
            )}
          </div>
        </article>

        <article className="app-card speech-summary-card">
          <div className="speech-section-heading">
            <h2 className="card-title">
              <Sparkles size={18} aria-hidden="true" /> AI summary
            </h2>
            {speech.summaryStatus && speech.summaryStatus !== "completed" ? (
              <span className="pill">{speech.summaryStatus}</span>
            ) : null}
          </div>

          <p className="card-copy">
            {aiSummary?.overview
              ?? speech.summary
              ?? (speech.summaryStatus
                ? summaryStatusCopy[speech.summaryStatus]
                : "An AI summary will appear here once this recording has been processed.")}
          </p>
          {speech.summaryError ? (
            <p className="meta-line is-error">{speech.summaryError}</p>
          ) : null}
          {canRetrySummary ? (
            <div className="button-row">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isRetryingSummary}
                onClick={() => void handleRetrySummary()}
              >
                {isRetryingSummary ? "Retrying summary..." : "Retry AI summary"}
              </button>
            </div>
          ) : null}
          {summaryRetryNotice ? <p className="meta-line" role="status">{summaryRetryNotice}</p> : null}

          {aiSummary ? (
            <>
              <SummaryList title="Main claims" items={aiSummary.mainClaims} />

              <section className="speech-summary-section">
                <h3>Evidence mentioned</h3>
                {aiSummary.evidenceMentioned.length > 0 ? (
                  <ul>
                    {aiSummary.evidenceMentioned.map((evidence, index) => (
                      <li key={`${evidence.description}-${index}`}>
                        {evidence.description}
                        {evidence.sourceAsStated
                          ? ` — source stated as ${evidence.sourceAsStated}`
                          : " — no source named in the recording"}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptySummaryList />
                )}
              </section>

              <section className="speech-summary-section">
                <h3>Structure</h3>
                {aiSummary.structure.length > 0 ? (
                  <ul>
                    {aiSummary.structure.map((section, index) => (
                      <li key={`${section.section}-${index}`}>
                        <strong>{section.section}</strong> — {section.description}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptySummaryList />
                )}
              </section>

              <SummaryList title="Delivery notes" items={aiSummary.deliveryNotes} />
              <SummaryList title="Suggestions" items={aiSummary.suggestions} />
            </>
          ) : null}
        </article>

        <form className="app-card speech-metadata-card" onSubmit={handleSubmit}>
          <div className="speech-section-heading">
            <h2 className="card-title">Speech metadata</h2>
            {isEditing ? <span className="pill">Editing</span> : null}
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="title">Speech title</label>
              <input
                id="title"
                value={form.title}
                readOnly={!isEditing}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, title: event.target.value } : current,
                  )
                }
              />
            </div>
            <div className="form-field">
              <label htmlFor="eventName">Event / practice</label>
              <input
                id="eventName"
                value={form.eventName}
                readOnly={!isEditing}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, eventName: event.target.value } : current,
                  )
                }
              />
            </div>
            <div className="form-field">
              <label htmlFor="format">Format</label>
              <select
                id="format"
                value={form.format}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          format: event.target.value as SpeechRecord["format"],
                        }
                      : current,
                  )
                }
              >
                {speechFormatGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.formats.map((format) => (
                      <option key={format} value={format}>{format}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="speechDetailTopicCategory">Topic category</label>
              <select
                id="speechDetailTopicCategory"
                value={form.topicCategory}
                disabled={!isEditing}
                onChange={(event) => setForm((current) => current
                  ? { ...current, topicCategory: event.target.value as NonNullable<SpeechRecord["topicCategory"]> }
                  : current)}
              >
                {speechTopicCategories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="speakerName">Speaker name</label>
              <input
                id="speakerName"
                value={form.speakerName}
                readOnly={!isEditing}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, speakerName: event.target.value } : current,
                  )
                }
              />
            </div>
            <div className="form-field">
              <label htmlFor="visibility">Visibility</label>
              <select
                id="visibility"
                value={form.visibility}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          visibility: event.target.value as NonNullable<
                            SpeechRecord["visibility"]
                          >,
                        }
                      : current,
                  )
                }
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="status">Status</label>
              <input id="status" value={speech.status} readOnly />
            </div>
            <button
              type="button"
              id="speechDetailCommentsEnabled"
              className="settings-toggle-row form-field full"
              aria-pressed={form.commentsEnabled}
              disabled={!isEditing}
              onClick={() =>
                setForm((current) =>
                  current ? { ...current, commentsEnabled: !current.commentsEnabled } : current,
                )
              }
            >
              <span><strong>Comments</strong><span className="meta-line">Allow viewers to leave feedback.</span></span>
              <span className={form.commentsEnabled ? "settings-toggle is-on" : "settings-toggle"}>
                {form.commentsEnabled ? "On" : "Off"}
              </span>
            </button>
            <div className="form-field">
              <label htmlFor="transcriptStatus">Transcript status</label>
              <input id="transcriptStatus" value={speech.transcriptStatus} readOnly />
            </div>
            <div className="form-field full">
              <label htmlFor="coachNotes">Coach notes</label>
              <textarea
                id="coachNotes"
                value={form.coachNotes}
                readOnly={!isEditing}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, coachNotes: event.target.value } : current,
                  )
                }
              />
            </div>
            <div className="form-field">
              <label htmlFor="tags">Tags</label>
              <input
                id="tags"
                value={form.tags}
                readOnly={!isEditing}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, tags: event.target.value } : current,
                  )
                }
              />
            </div>
            <div className="form-field">
              <label htmlFor="organizationTags">Organization tags</label>
              <input
                id="organizationTags"
                value={form.organizationTags}
                readOnly={!isEditing}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, organizationTags: event.target.value }
                      : current,
                  )
                }
              />
            </div>
            <div className="form-field full">
              <label>Audio or video file</label>
              <div className="speech-attachment-row">
                <FileAudio size={28} />
                <div>
                  <strong>{fileName}</strong>
                  <span className="meta-line">
                    {speech.mediaPath
                      ? "Recording available for playback"
                      : "No recording file is attached"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {message ? <p className="meta-line">{message}</p> : null}

          {isEditing ? (
            <div className="button-row" style={{ marginTop: "1rem" }}>
              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save changes"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={closeEditMode}>
                Cancel
              </button>
            </div>
          ) : null}
        </form>

        {speech.commentsEnabled ?? true ? (
          <article className="app-card speech-comments-card">
            <div className="row-between">
              <h2 className="card-title">Comments</h2>
              <span className="pill">{commentsState.data.filter((comment) => comment.speechId === speech.id).length} replies</span>
            </div>
            <div className="list" style={{ marginTop: "1rem" }}>
              {commentsState.data
                .filter((comment) => comment.speechId === speech.id)
                .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
                .map((comment) => {
                  const vote = getMyCommentVote(comment.id);
                  return (
                    <div key={comment.id} className="list-item">
                      <strong>{comment.authorName}</strong>
                      <span className="card-copy">{comment.content}</span>
                      <span className="meta-line">{formatDateTime(comment.createdAt)}</span>
                      <div className="forum-comment-actions">
                        <button
                          type="button"
                          className={vote.like ? "forum-action-button is-like" : "forum-action-button"}
                          aria-pressed={vote.like}
                          aria-label={"Like feedback from " + comment.authorName}
                          onClick={() => void voteOnComment(comment, "like")}
                        >
                          <ThumbsUp size={14} /> {comment.likeCount ?? 0}
                        </button>
                        <button
                          type="button"
                          className={vote.dislike ? "forum-action-button is-dislike" : "forum-action-button"}
                          aria-pressed={vote.dislike}
                          aria-label={"Dislike feedback from " + comment.authorName}
                          onClick={() => void voteOnComment(comment, "dislike")}
                        >
                          <ThumbsDown size={14} /> {comment.dislikeCount ?? 0}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
            <div className="forum-comment-form">
              <input
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                placeholder="Leave constructive feedback..."
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submitComment();
                  }
                }}
              />
              <button type="button" className="btn btn-primary" onClick={() => void submitComment()}>Comment</button>
            </div>
          </article>
        ) : (
          <article className="app-card"><h2 className="card-title">Comments are off</h2><p className="card-copy">The uploader disabled comments for this speech.</p></article>
        )}
      </section>
      {shareOpen ? (
        <ShareToMessageDialog
          title={speech.title}
          url={`${window.location.origin}/app/speeches/${speech.id}`}
          previewKind="speech"
          allowCopyLink={speech.visibility === "public"}
          onBeforeSend={speech.visibility === "private" && isOwner
            ? (recipientIds) => grantPrivateSpeechAccess(speech.id, currentUser!.id, recipientIds)
            : undefined}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
      {isReportOpen && !isOwner ? (
        <div className="community-modal-overlay" role="presentation" onMouseDown={() => !isReporting && setIsReportOpen(false)}>
          <div
            className="community-modal app-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="speechReportTitle"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="speechReportTitle" className="card-title">Report this speech</h2>
            <p className="card-copy">Tell us what needs review. Your report is not shown to the speaker.</p>
            <div className="form-field">
              <label htmlFor="speechReportReason">Reason</label>
              <select
                id="speechReportReason"
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value as typeof reportReason)}
              >
                <option>Inappropriate content</option>
                <option>Harassment</option>
                <option>Spam</option>
                <option>Copyright</option>
                <option>Other</option>
              </select>
            </div>
            <div className="form-field" style={{ marginTop: "1rem" }}>
              <label htmlFor="speechReportDetails">Details (optional)</label>
              <textarea
                id="speechReportDetails"
                value={reportDetails}
                maxLength={1000}
                onChange={(event) => setReportDetails(event.target.value)}
                placeholder="Add context that will help a reviewer."
              />
            </div>
            {reportError ? <p className="speech-field-error" role="alert">{reportError}</p> : null}
            <div className="button-row community-modal-actions">
              <button type="button" className="btn btn-secondary" disabled={isReporting} onClick={() => setIsReportOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={isReporting} onClick={() => void handleReport()}>
                {isReporting ? "Submitting..." : "Submit report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
