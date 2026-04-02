import { useState, type FormEvent } from "react";
import { PageMeta } from "@/components/common/PageMeta";
import { createSpeechRecord } from "@/features/speeches/speechService";
import type { SpeechRecord } from "@/types/models";

const initialForm = {
  title: "",
  eventName: "",
  format: "Public Forum" as SpeechRecord["format"],
  speakerName: "",
  coachNotes: "",
  tags: "delivery, framing",
  organizationTags: "feedback-requested",
};

export const SpeechUploadPage = () => {
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      const speech = await createSpeechRecord({
        ...form,
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
        <p>
          The form is Firebase-ready for Storage uploads and Firestore metadata,
          while still working as a demo flow before credentials are added.
        </p>
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
                placeholder="Quarterfinal rebuttal"
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
                placeholder="Spring Invitational"
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
                <input
                  id="speechFile"
                  type="file"
                  accept="audio/*,video/*"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <p className="helper-line" style={{ marginBottom: 0 }}>
                  {file ? `Selected: ${file.name}` : "No file selected yet."}
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

        <div className="stack">
          <article className="app-card">
            <span className="pill">Transcript status</span>
            <h2 className="card-title" style={{ marginTop: "0.75rem" }}>
              Processing pipeline
            </h2>
            <div className="list" style={{ marginTop: "1rem" }}>
              <div className="list-item">
                <strong>1. Upload media</strong>
                <span className="meta-line">Store in Firebase Storage with a durable path.</span>
              </div>
              <div className="list-item">
                <strong>2. Queue transcript</strong>
                <span className="meta-line">Set transcript state to pending while analysis is deferred.</span>
              </div>
              <div className="list-item">
                <strong>3. Review and feedback</strong>
                <span className="meta-line">Attach coach observations and next-step prompts.</span>
              </div>
            </div>
          </article>

          <article className="app-card">
            <span className="pill">AI-ready fields</span>
            <p className="card-copy">
              This flow already captures tags, organization markers, and a place
              for future recommendation metadata without requiring model
              orchestration in v1.
            </p>
          </article>
        </div>
      </section>
    </>
  );
};
