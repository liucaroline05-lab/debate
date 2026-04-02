import { NavLink, useParams } from "react-router-dom";
import { PageMeta } from "@/components/common/PageMeta";
import { speeches } from "@/data/mockData";
import { formatDateTime } from "@/lib/date";

export const SpeechDetailPage = () => {
  const { speechId } = useParams();
  const speech = speeches.find((item) => item.id === speechId) ?? speeches[0];

  return (
    <>
      <PageMeta
        title={speech.title}
        description={`Review transcript state, event metadata, and feedback for ${speech.title}.`}
      />
      <header className="route-header">
        <p className="eyebrow">Speech detail</p>
        <h1>{speech.title}</h1>
        <p>
          {speech.format} • {speech.eventName} • Uploaded {formatDateTime(speech.uploadedAt)}
        </p>
      </header>

      <section className="speech-grid">
        <article className="app-card">
          <span className="pill">{speech.transcriptStatus}</span>
          <h2 className="card-title" style={{ marginTop: "0.75rem" }}>
            Feedback snapshot
          </h2>
          <div className="list" style={{ marginTop: "1rem" }}>
            <div className="list-item">
              <strong>Status</strong>
              <span className="meta-line">{speech.status}</span>
            </div>
            <div className="list-item">
              <strong>Coach notes</strong>
              <span className="meta-line">{speech.coachNotes}</span>
            </div>
            <div className="list-item">
              <strong>Tags</strong>
              <span className="meta-line">{speech.tags.join(" • ")}</span>
            </div>
          </div>
        </article>

        <article className="app-card">
          <span className="pill">Next step</span>
          <h2 className="card-title" style={{ marginTop: "0.75rem" }}>
            Suggested actions
          </h2>
          <div className="list" style={{ marginTop: "1rem" }}>
            <div className="list-item">
              <strong>Run a reflection post</strong>
              <span className="meta-line">
                Share what improved and what still felt shaky in the community channel.
              </span>
            </div>
            <div className="list-item">
              <strong>Open a practice round</strong>
              <span className="meta-line">
                Turn this speech into an async debate round with a matched partner.
              </span>
            </div>
          </div>
          <div className="button-row" style={{ marginTop: "1rem" }}>
            <NavLink to="/app/debates" className="btn btn-primary">
              Open debates
            </NavLink>
            <NavLink to="/app/community" className="btn btn-secondary">
              Post reflection
            </NavLink>
          </div>
        </article>
      </section>
    </>
  );
};
