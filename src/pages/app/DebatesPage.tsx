import { PageMeta } from "@/components/common/PageMeta";
import { debateThreads, matchRequests } from "@/data/mockData";
import { useFirebaseCollection } from "@/hooks/useFirebaseCollection";
import { formatDateTime } from "@/lib/date";

export const DebatesPage = () => {
  const debateState = useFirebaseCollection("debates", debateThreads);
  const matchState = useFirebaseCollection("matchRequests", matchRequests);

  return (
    <>
      <PageMeta
        title="Async Debate"
        description="Find partners, manage turn-based rounds, and track debate status."
      />
      <header className="route-header">
        <p className="eyebrow">Async Debate</p>
        <h1>Practice rounds that fit real schedules.</h1>
        <p>
          Browse open match requests, follow debate status, and keep round
          summaries close to each turn.
        </p>
      </header>

      <section className="debate-grid">
        {debateState.data.map((debate) => (
          <article key={debate.id} className="debate-card">
            <span className="pill">{debate.status}</span>
            <h3 className="card-title" style={{ marginTop: "0.9rem" }}>
              {debate.topic}
            </h3>
            <p className="card-copy">
              {debate.format} with {debate.partnerName}
            </p>
            <div className="list" style={{ marginTop: "1rem" }}>
              {debate.turns.map((turn) => (
                <div key={turn.id} className="list-item">
                  <strong>
                    {turn.side} • {turn.author}
                  </strong>
                  <span className="meta-line">
                    {turn.summary} • {formatDateTime(turn.submittedAt)}
                  </span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="section">
        <div className="route-header" style={{ marginBottom: "1.25rem" }}>
          <h2>Open match requests</h2>
          <p>These cards model the future partner-matching surface backed by Firestore.</p>
        </div>
        <div className="three-up">
          {matchState.data.map((match) => (
            <article key={match.id} className="app-card">
              <span className="pill">{match.status}</span>
              <h3 className="card-title" style={{ marginTop: "0.75rem", fontSize: "1.45rem" }}>
                {match.topic}
              </h3>
              <p className="card-copy">
                {match.skillLevel} • {match.preferredSide} • Requested by {match.requestedBy}
              </p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
};
