import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { PageMeta } from "@/components/common/PageMeta";
import { seededDebates } from "@/data/firestoreSeeds";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";

export const DebateWatchPage = () => {
  const { debateId } = useParams();
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

  return (
    <>
      <PageMeta
        title={debate.topic}
        description={`Watch and review ${debate.topic}.`}
      />
      <header className="route-header">
        <p className="eyebrow">Debate Watch</p>
        <h1>{debate.topic}</h1>
        <p>
          {debate.format} • {debate.status} • {debate.summary ?? "Review this async round."}
        </p>
      </header>

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
    </>
  );
};
