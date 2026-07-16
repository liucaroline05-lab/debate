import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import {
  Download,
  FileAudio,
  Flag,
  MoreHorizontal,
  Pause,
  Pencil,
  Trash2,
  Volume2,
} from "lucide-react";
import { PageMeta } from "@/components/common/PageMeta";
import { useAuth } from "@/features/auth/AuthContext";
import {
  deleteSpeechRecord,
  addSpeechComment,
  reportSpeechRecord,
  updateSpeechRecord,
} from "@/features/speeches/speechService";
import { formatDateTime } from "@/lib/date";
import { firestore } from "@/lib/firebase";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type { SpeechComment, SpeechRecord } from "@/types/models";

const EMPTY_SPEECH_COMMENTS: SpeechComment[] = [];

const toFormState = (speech: SpeechRecord) => ({
  title: speech.title,
  eventName: speech.eventName,
  format: speech.format,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const commentsState = useSeededFirestoreCollection<SpeechComment>(
    "speechComments",
    EMPTY_SPEECH_COMMENTS,
  );

  const isOwner = Boolean(speech?.creatorId && speech.creatorId === currentUser?.id);
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
    if (!speech) {
      return;
    }

    await reportSpeechRecord(speech.id);
    setMenuOpen(false);
    setMessage("Speech reported.");
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
                  onClick={() => void handleReport()}
                >
                  <Flag size={16} /> Report
                </button>
              )}
            </div>
          ) : null}
        </div>
      </header>

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
              <div className="speech-media-actions">
                <audio className="speech-native-audio" controls src={speech.mediaPath}>
                  <a href={speech.mediaPath}>Open recording</a>
                </audio>
                <a className="btn btn-secondary" href={speech.mediaPath} download={fileName} target="_blank" rel="noreferrer">
                  <Download size={16} /> Download
                </a>
              </div>
            ) : null}
            <div className="speech-player-display" aria-hidden="true">
              <button type="button" className="speech-round-control" tabIndex={-1}>
                <Pause size={18} />
              </button>
              <span>01:24</span>
              <div className="speech-progress-track">
                <div className="speech-progress-fill" />
                <div className="speech-progress-thumb" />
              </div>
              <span>03:45</span>
              <Volume2 size={20} />
              <MoreHorizontal size={19} />
            </div>
          </div>
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
                <option>Policy</option>
                <option>Lincoln-Douglas</option>
                <option>Public Forum</option>
                <option>Congress</option>
                <option>Extemp</option>
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
            <label className="settings-toggle-row form-field full" htmlFor="speechDetailCommentsEnabled">
              <span><strong>Comments</strong><span className="meta-line">Allow viewers to leave feedback.</span></span>
              <input
                id="speechDetailCommentsEnabled"
                type="checkbox"
                checked={form.commentsEnabled}
                disabled={!isEditing}
                onChange={(event) => setForm((current) => current ? { ...current, commentsEnabled: event.target.checked } : current)}
              />
            </label>
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
                .map((comment) => (
                  <div key={comment.id} className="list-item">
                    <strong>{comment.authorName}</strong>
                    <span className="card-copy">{comment.content}</span>
                    <span className="meta-line">{formatDateTime(comment.createdAt)}</span>
                  </div>
                ))}
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
    </>
  );
};
