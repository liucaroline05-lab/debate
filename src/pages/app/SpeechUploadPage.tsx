import { useMemo, useRef, useState, type FormEvent } from "react";
import { NavLink } from "react-router-dom";
import { where, type QueryConstraint } from "firebase/firestore";
import { Search, SlidersHorizontal, Upload, X } from "lucide-react";
import { PageMeta } from "@/components/common/PageMeta";
import { createSpeechRecord } from "@/features/speeches/speechService";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import { formatDateTime } from "@/lib/date";
import { defaultSpeechFormat, speechFormatGroups, speechFormats } from "@/lib/speechFormats";
import { speechTopicCategories } from "@/lib/speechTopics";
import type { SpeechRecord } from "@/types/models";
import { useAuth } from "@/features/auth/AuthContext";

const initialForm = {
  title: "",
  eventName: "",
  format: defaultSpeechFormat as SpeechRecord["format"],
  topicCategory: "Other" as NonNullable<SpeechRecord["topicCategory"]>,
  visibility: "private" as NonNullable<SpeechRecord["visibility"]>,
  coachNotes: "",
  tags: "delivery, framing",
  organizationTags: "feedback-requested",
  commentsEnabled: true,
};
const EMPTY_SPEECH_SEEDS: SpeechRecord[] = [];

export const SpeechUploadPage = () => {
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [fieldError, setFieldError] = useState<"title" | "eventName" | null>(null);
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState("All");
  const [topicFilter, setTopicFilter] = useState("All");
  const [visibilityFilter, setVisibilityFilter] = useState("All");
  const [sortOrder, setSortOrder] = useState("Newest");
  const titleRef = useRef<HTMLInputElement>(null);
  const eventRef = useRef<HTMLInputElement>(null);

  const { currentUser } = useAuth();
  const currentUserId = currentUser?.id;
  const ownSpeechConstraints = useMemo<QueryConstraint[]>(
    () => currentUserId ? [where("creatorId", "==", currentUserId)] : [],
    [currentUserId],
  );
  const publicSpeechConstraints = useMemo<QueryConstraint[]>(
    () => [where("visibility", "==", "public")],
    [],
  );
  const ownSpeeches = useSeededFirestoreCollection<SpeechRecord>(
    "speeches",
    EMPTY_SPEECH_SEEDS,
    ownSpeechConstraints,
    Boolean(currentUserId),
    currentUserId ? `speeches:owner:${currentUserId}` : undefined,
  );
  const publicSpeeches = useSeededFirestoreCollection<SpeechRecord>(
    "speeches",
    EMPTY_SPEECH_SEEDS,
    publicSpeechConstraints,
    true,
    "speeches:public",
  );
  const speechHistory = useMemo(() => {
    const mine = [...ownSpeeches.data];
    const mineIds = new Set(mine.map((speech) => speech.id));
    return [
      ...mine,
      ...publicSpeeches.data.filter((speech) => !mineIds.has(speech.id)),
    ];
  }, [ownSpeeches.data, publicSpeeches.data]);
  const filteredSpeeches = useMemo(() => {
    const search = query.trim().toLowerCase();
    return speechHistory.filter((speech) => {
      if (formatFilter !== "All" && speech.format !== formatFilter) return false;
      if (topicFilter !== "All" && (speech.topicCategory ?? "Uncategorized") !== topicFilter) return false;
      if (visibilityFilter !== "All" && (speech.visibility ?? "private") !== visibilityFilter.toLowerCase()) return false;
      if (!search) return true;
      return [
        speech.title,
        speech.eventName,
        speech.format,
        speech.topicCategory,
        speech.speakerName,
        speech.coachNotes,
        ...(speech.tags ?? []),
        ...(speech.organizationTags ?? []),
      ].some((value) => value?.toLowerCase().includes(search));
    }).sort((left, right) => sortOrder === "Title"
      ? left.title.localeCompare(right.title)
      : sortOrder === "Oldest"
        ? left.uploadedAt.localeCompare(right.uploadedAt)
        : right.uploadedAt.localeCompare(left.uploadedAt));
  }, [formatFilter, query, sortOrder, speechHistory, topicFilter, visibilityFilter]);
  const mySpeeches = filteredSpeeches.filter((speech) => speech.creatorId === currentUserId);
  const otherSpeeches = filteredSpeeches.filter((speech) => speech.creatorId !== currentUserId);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.title.trim()) {
      setFieldError("title");
      titleRef.current?.focus();
      return;
    }
    if (!form.eventName.trim()) {
      setFieldError("eventName");
      eventRef.current?.focus();
      return;
    }
    setFieldError(null);

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
        speakerName: currentUser.displayName?.trim() || "Speaker",
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
      setIsUploadOpen(false);
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
        <div className="row-between">
          <div>
            <p className="eyebrow">Speech library</p>
            <h1>Find a speech worth revisiting.</h1>
            <p>Search your recordings and public speeches shared by other members.</p>
          </div>
          <button
            type="button"
            className="btn btn-primary forum-primary-cta"
            aria-expanded={isUploadOpen}
            onClick={() => {
              setIsUploadOpen(true);
              window.setTimeout(() => titleRef.current?.focus(), 0);
            }}
          >
            <Upload size={18} /> Upload Speech
          </button>
        </div>
      </header>

      {isUploadOpen ? (
        <form className="app-card speech-upload-card composer-slide-down" onSubmit={handleSubmit} noValidate>
          <div className="row-between speech-upload-heading">
            <div>
              <p className="eyebrow">New recording</p>
              <h2 className="card-title">Upload a speech</h2>
            </div>
            <button type="button" className="forum-icon-button" aria-label="Close upload form" onClick={() => setIsUploadOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="speechUploadTitle">Speech title</label>
              <input
                id="speechUploadTitle"
                ref={titleRef}
                value={form.title}
                aria-invalid={fieldError === "title"}
                aria-describedby={fieldError === "title" ? "speechTitleError" : undefined}
                onChange={(event) => {
                  setForm((current) => ({ ...current, title: event.target.value }));
                  if (fieldError === "title") setFieldError(null);
                }}
                placeholder="Name your speech!"
              />
              {fieldError === "title" ? <span id="speechTitleError" className="speech-field-error" role="alert">Add a speech title before saving.</span> : null}
            </div>
            <div className="form-field">
              <label htmlFor="speechUploadEvent">Event / practice</label>
              <input
                id="speechUploadEvent"
                ref={eventRef}
                value={form.eventName}
                aria-invalid={fieldError === "eventName"}
                aria-describedby={fieldError === "eventName" ? "speechEventError" : undefined}
                onChange={(event) => {
                  setForm((current) => ({ ...current, eventName: event.target.value }));
                  if (fieldError === "eventName") setFieldError(null);
                }}
                placeholder="Choose your event"
              />
              {fieldError === "eventName" ? <span id="speechEventError" className="speech-field-error" role="alert">Add an event or practice name before saving.</span> : null}
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
              <label htmlFor="speechTopicCategory">Topic category</label>
              <select
                id="speechTopicCategory"
                value={form.topicCategory}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  topicCategory: event.target.value as NonNullable<SpeechRecord["topicCategory"]>,
                }))}
              >
                {speechTopicCategories.map((category) => <option key={category}>{category}</option>)}
              </select>
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
            <button
              type="button"
              id="speechCommentsEnabled"
              className="settings-toggle-row form-field full"
              aria-pressed={form.commentsEnabled}
              onClick={() =>
                setForm((current) => ({ ...current, commentsEnabled: !current.commentsEnabled }))
              }
            >
              <span>
                <strong>Allow comments</strong>
                <span className="meta-line">Let viewers leave feedback on the speech detail page.</span>
              </span>
              <span className={form.commentsEnabled ? "settings-toggle is-on" : "settings-toggle"}>
                {form.commentsEnabled ? "On" : "Off"}
              </span>
            </button>
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
            <button type="button" className="btn btn-secondary" disabled={isSubmitting} onClick={() => setIsUploadOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {message && !isUploadOpen ? <p className="speech-library-status" role="status">{message}</p> : null}

      <section className="app-card resource-filter-panel speech-library-filters" aria-label="Search speeches">
        <label className="forum-search resource-search" htmlFor="speechSearch">
          <Search size={18} aria-hidden="true" />
          <input
            id="speechSearch"
            type="search"
            placeholder="Search titles, events, speakers, topics, or tags"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <details className="speech-filter-details">
          <summary><SlidersHorizontal size={16} aria-hidden="true" /> Filters</summary>
          <div className="resource-filter-grid">
            <div className="form-field">
              <label htmlFor="speechFormatFilter">Format</label>
              <select id="speechFormatFilter" value={formatFilter} onChange={(event) => setFormatFilter(event.target.value)}>
                <option>All</option>
                {speechFormats.map((format) => <option key={format}>{format}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="speechTopicFilter">Topic category</label>
              <select id="speechTopicFilter" value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)}>
                <option>All</option>
                {speechTopicCategories.map((category) => <option key={category}>{category}</option>)}
                <option>Uncategorized</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="speechVisibilityFilter">Visibility</label>
              <select id="speechVisibilityFilter" value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value)}>
                <option>All</option>
                <option>Public</option>
                <option>Private</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="speechSortOrder">Sort by</label>
              <select id="speechSortOrder" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                <option>Newest</option>
                <option>Oldest</option>
                <option>Title</option>
              </select>
            </div>
          </div>
        </details>
        <span className="meta-line">{filteredSpeeches.length} speech{filteredSpeeches.length === 1 ? "" : "es"} found</span>
      </section>

      <section className="speech-library-sections" aria-label="Past speeches">
        <article className="app-card speech-history-card">
          <div className="row-between">
            <h2 className="card-title">Your speeches</h2>
            <span className="meta-line">{mySpeeches.length}</span>
          </div>
          <div className="list speech-history-list">
            {mySpeeches.map((speech) => (
              <NavLink key={speech.id} to={`/app/speeches/${speech.id}`} className="list-item speech-list-item speech-list-link">
                <strong>{speech.title}</strong>
                <span className="meta-line">{speech.format} · {speech.topicCategory ?? "Uncategorized"} · {formatDateTime(speech.uploadedAt)}</span>
              </NavLink>
            ))}
          </div>
          {mySpeeches.length === 0 ? <p className="card-copy">{ownSpeeches.isLoading ? "Loading your speeches..." : "No speeches match your search yet."}</p> : null}
        </article>
        <article className="app-card speech-history-card">
          <div className="row-between">
            <h2 className="card-title">Community speeches</h2>
            <span className="meta-line">{otherSpeeches.length}</span>
          </div>
          <div className="list speech-history-list">
            {otherSpeeches.map((speech) => (
              <NavLink key={speech.id} to={`/app/speeches/${speech.id}`} className="list-item speech-list-item speech-list-link">
                <strong>{speech.title}</strong>
                <span className="meta-line">{speech.speakerName} · {speech.format} · {speech.topicCategory ?? "Uncategorized"} · {formatDateTime(speech.uploadedAt)}</span>
              </NavLink>
            ))}
          </div>
          {otherSpeeches.length === 0 ? <p className="card-copy">{publicSpeeches.isLoading ? "Loading community speeches..." : "No community speeches match your search yet."}</p> : null}
        </article>
      </section>
    </>
  );
};
