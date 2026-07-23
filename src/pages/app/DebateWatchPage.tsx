import { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { PageMeta } from "@/components/common/PageMeta";
import { seededDebates } from "@/data/firestoreSeeds";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";

export const DebateWatchPage = () => {
  const { debateId } = useParams();
  const location = useLocation();
  const debatesState = useSeededFirestoreCollection("debates", seededDebates);

  const debate = useMemo(
    () => debatesState.data.find((entry) => entry.id === debateId),
    [debateId, debatesState.data],
  );

  if (!debate) {
    return (
      <section className="empty-state">
        <h2 className="card-title">Debate not found</h2>
      </section>
    );
  }

  const isSummaryView = new URLSearchParams(location.search).get("view") === "summary";
  const submittedTurns = debate.turns?.filter((turn) => turn.status === "submitted") ?? [];
  const summaryText = debate.summary ?? "An AI summary will appear here after the debate has been processed.";

  return (
    <>
      <PageMeta
        title={debate.topic}
        description={`Watch and review ${debate.topic}.`}
      />
      <header className="route-header">
        <p className="eyebrow">{isSummaryView ? "Debate Summary" : "Debate Watch"}</p>
        <h1>{debate.topic}</h1>
        <p>
          {debate.format} • {debate.status} • {isSummaryView ? summaryText : "Review this async round."}
        </p>
      </header>

      {isSummaryView ? (
        <section className="stack">
          <article className="app-card">
            <h2 className="card-title">Debate summary</h2>
            <p className="card-copy">{summaryText}</p>
          </article>

          <article className="app-card">
            <h2 className="card-title">Speech highlights</h2>
            <div className="list" style={{ marginTop: "1rem" }}>
              {submittedTurns.length > 0 ? submittedTurns.map((turn) => (
                <div key={turn.id} className="list-item">
                  <strong>{turn.author} · {turn.side}</strong>
                  <span className="meta-line">{turn.summary}</span>
                </div>
              )) : (
                <p className="card-copy">Speech highlights will appear after the uploaded audio is summarized.</p>
              )}
            </div>
          </article>
        </section>
      ) : (
      <section className="settings-grid">
        <article className="app-card">
          <h2 className="card-title">Matchup</h2>
          <div className="list" style={{ marginTop: "1rem" }}>
            <div className="list-item">
              <strong>{debate.affirmative.name}</strong>
              <span className="meta-line">{debate.affirmative.label}</span>
            </div>
            <div className="list-item">
              <strong>{debate.negative.name}</strong>
              <span className="meta-line">{debate.negative.label}</span>
            </div>
          </div>
        </article>

        <article className="app-card">
          <h2 className="card-title">Round summary</h2>
          <div className="list" style={{ marginTop: "1rem" }}>
            <div className="list-item">
              <strong>Status</strong>
              <span className="meta-line">{debate.status}</span>
            </div>
            <div className="list-item">
              <strong>Spectators</strong>
              <span className="meta-line">{debate.spectators}</span>
            </div>
            <div className="list-item">
              <strong>AI judged</strong>
              <span className="meta-line">{debate.aiJudged ? "Yes" : "No"}</span>
            </div>
          </div>
        </article>
      </section>
      )}
    </>
  );
};
