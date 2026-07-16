import { useMemo, useState, type FormEvent } from "react";
import { NavLink } from "react-router-dom";
import { where, type QueryConstraint } from "firebase/firestore";
import { PageMeta } from "@/components/common/PageMeta";
import { seededSpeeches } from "@/data/firestoreSeeds";
import { createSpeechRecord } from "@/features/speeches/speechService";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import { formatDateTime } from "@/lib/date";
import type { SpeechRecord } from "@/types/models";
import { useAuth } from "@/features/auth/AuthContext";

const initialForm = {
  title: "",
  eventName: "",
  format: "Public Forum" as SpeechRecord["format"],
  visibility: "private" as NonNullable<SpeechRecord["visibility"]>,
  speakerName: "",
  coachNotes: "",
  tags: "delivery, framing",
  organizationTags: "feedback-requested",
  commentsEnabled: true,
};

export const SpeechUploadPage = () => {
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { currentUser } = useAuth();
  const ownSpeechConstraints = useMemo<QueryConstraint[]>(
    () => currentUser ? [where("creatorId", "==", currentUser.id)] : [],
    [currentUser],
  );
  const publicSpeechConstraints = useMemo<QueryConstraint[]>(
    () => [where("visibility", "==", "public")],
    [],
  );
  const ownSpeeches = useSeededFirestoreCollection<SpeechRecord>(
    "speeches",
    seededSpeeches,
    ownSpeechConstraints,
    Boolean(currentUser),
  );
  const publicSpeeches = useSeededFirestoreCollection<SpeechRecord>(
    "speeches",
    seededSpeeches,
    publicSpeechConstraints,
  );
  const speechHistory = useMemo(() => {
    const newestFirst = (left: SpeechRecord, right: SpeechRecord) =>
      right.uploadedAt.localeCompare(left.uploadedAt);
    const mine = [...ownSpeeches.data].sort(newestFirst);
    const mineIds = new Set(mine.map((speech) => speech.id));
    return [
      ...mine,
      ...publicSpeeches.data.filter((speech) => !mineIds.has(speech.id)).sort(newestFirst),
    ];
  }, [ownSpeeches.data, publicSpeeches.data]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentUser) {
      setMessage("You must be signed in to upload a speech.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      const speech = await createSpeechRecord({
        ...form,
        userId: currentUser.id,
        tags: form.tags.split(",").map((item) => item.trim()).filter(Boolean),
        organizationTags: form.organizationTags
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        file,
      });

      setMessage(`Saved "${speech.title}" and queued transcript processing.`);
      setForm(initialForm);
      setFile(null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save your speech yet.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <PageMeta
        title="Record and Upload Speech"
        description="Upload a speech recording with metadata, transcript state, and coach feedback notes."
      />
      <header className="route-header">
        <p className="eyebrow">Record / Upload</p>
        <h1>Bring new speeches into the studio.</h1>
        {/* <p>
          The form is Firebase-ready for Storage uploads and Firestore metadata,
          while still working as a demo flow before credentials are added.
        </p> */}
      </header>

      <section className="speech-grid">
        <form className="app-card" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="title">Speech title</label>
              <input
                id="title"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Name your speech!"
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="eventName">Event / practice</label>
              <input
                id="eventName"
                value={form.eventName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, eventName: event.target.value }))
                }
                placeholder="Choose your event"
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="format">Format</label>
              <select
                id="format"
                value={form.format}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    format: event.target.value as SpeechRecord["format"],
                  }))
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
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    speakerName: event.target.value,
                  }))
                }
                placeholder="Maya Rivera"
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="visibility">Visibility</label>
              <select
                id="visibility"
                value={form.visibility}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    visibility: event.target.value as NonNullable<
                      SpeechRecord["visibility"]
                    >,
                  }))
                }
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </div>
            <div className="form-field full">
              <label htmlFor="coachNotes">Coach notes</label>
              <textarea
                id="coachNotes"
                value={form.coachNotes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    coachNotes: event.target.value,
                  }))
                }
                placeholder="What should reviewers listen for?"
              />
            </div>
            <label className="settings-toggle-row form-field full" htmlFor="speechCommentsEnabled">
              <span>
                <strong>Allow comments</strong>
                <span className="meta-line">Let viewers leave feedback on the speech detail page.</span>
              </span>
              <input
                id="speechCommentsEnabled"
                type="checkbox"
                checked={form.commentsEnabled}
                onChange={(event) => setForm((current) => ({ ...current, commentsEnabled: event.target.checked }))}
              />
            </label>
            <div className="form-field">
              <label htmlFor="tags">Tags</label>
              <input
                id="tags"
                value={form.tags}
                onChange={(event) =>
                  setForm((current) => ({ ...current, tags: event.target.value }))
                }
              />
            </div>
            <div className="form-field">
              <label htmlFor="organizationTags">Organization tags</label>
              <input
                id="organizationTags"
                value={form.organizationTags}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    organizationTags: event.target.value,
                  }))
                }
              />
            </div>
            <div className="form-field full">
              <label htmlFor="speechFile">Audio or video file</label>
              <div className="dropzone">
                <div className="file-input-shell">
                  <input
                    id="speechFile"
                    type="file"
                    accept="audio/*,video/*"
                    className="file-input-native"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                  <label htmlFor="speechFile" className="file-input-trigger">
                    Choose file
                  </label>
                  <span className={file ? "file-input-name has-file" : "file-input-name"}>
                    {file ? file.name : "No file chosen"}
                  </span>
                </div>
                <p className="helper-line" style={{ marginBottom: 0 }}>
                  {file ? "Ready to upload." : "No file selected yet."}
                </p>
              </div>
            </div>
          </div>

          {message ? <p className="meta-line">{message}</p> : null}

          <div className="button-row" style={{ marginTop: "1rem" }}>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save speech"}
            </button>
          </div>
        </form>

        <aside className="app-card speech-history-card">
          <div className="row-between">
            <div>
              <span className="pill">Speech library</span>
              <h2 className="card-title" style={{ marginTop: "0.75rem" }}>Past speeches</h2>
            </div>
            <span className="meta-line">Yours first</span>
          </div>
          <div className="list speech-history-list" style={{ marginTop: "1rem" }}>
            {speechHistory.map((speech) => (
              <NavLink key={speech.id} to={`/app/speeches/${speech.id}`} className="list-item speech-list-item speech-list-link">
                <strong>{speech.title}</strong>
                <span className="meta-line">
                  {speech.creatorId === currentUser?.id ? "Your speech" : speech.speakerName} · {speech.format} · {formatDateTime(speech.uploadedAt)}
                </span>
              </NavLink>
            ))}
          </div>
          {speechHistory.length === 0 ? <p className="card-copy">Your uploaded speeches and public community speeches will appear here.</p> : null}
        </aside>
      </section>
    </>
  );
};
