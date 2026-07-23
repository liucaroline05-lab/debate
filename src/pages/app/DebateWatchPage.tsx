import { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { PageMeta } from "@/components/common/PageMeta";
import { seededDebates } from "@/data/firestoreSeeds";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type {
  DebateSideSummary,
  DebateSummaryStatus,
} from "@/types/models";

const summaryStatusCopy: Record<DebateSummaryStatus, string> = {
  waiting_for_transcripts:
    "The debate is complete. Its recordings are still being transcribed.",
  processing: "The transcripts are ready and the debate summary is being prepared.",
  completed: "The debate summary is ready.",
  failed:
    "The AI summary could not be generated. An administrator can check the function logs and retry processing.",
};

const EmptySummaryList = () => (
  <p className="meta-line">Nothing in the transcript supported this category.</p>
);

const SideSummary = ({
  label,
  summary,
}: {
  label: string;
  summary: DebateSideSummary;
}) => (
  <article className="app-card">
    <h2 className="card-title">{label}</h2>
    <div className="stack" style={{ marginTop: "1rem" }}>
      <div>
        <strong>Claims</strong>
        {summary.claims.length > 0 ? (
          <ul>
            {summary.claims.map((claim, index) => (
              <li key={`${claim.text}-${index}`}>{claim.text}</li>
            ))}
          </ul>
        ) : <EmptySummaryList />}
      </div>
      <div>
        <strong>Evidence mentioned</strong>
        {summary.evidence.length > 0 ? (
          <ul>
            {summary.evidence.map((evidence, index) => (
              <li key={`${evidence.description}-${index}`}>
                {evidence.description}
                {evidence.sourceAsStated
                  ? ` — source stated as ${evidence.sourceAsStated}`
                  : " — no source named in the recording"}
              </li>
            ))}
          </ul>
        ) : <EmptySummaryList />}
      </div>
      <div>
        <strong>Rebuttals</strong>
        {summary.rebuttals.length > 0 ? (
          <ul>
            {summary.rebuttals.map((rebuttal, index) => (
              <li key={`${rebuttal.text}-${index}`}>{rebuttal.text}</li>
            ))}
          </ul>
        ) : <EmptySummaryList />}
      </div>
    </div>
  </article>
);

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
  const aiSummary = debate.aiSummary;
  const summaryText =
    aiSummary?.neutralOutcome.summary
    ?? (debate.summaryStatus ? summaryStatusCopy[debate.summaryStatus] : undefined)
    ?? debate.summary
    ?? "An AI summary will appear here after the debate has been processed.";

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
            {debate.summaryStatus && debate.summaryStatus !== "completed" ? (
              <span className="meta-line">Processing status: {debate.summaryStatus.replaceAll("_", " ")}</span>
            ) : null}
          </article>

          {aiSummary ? (
            <>
              <section className="settings-grid" aria-label="Arguments by side">
                <SideSummary label="Affirmative case" summary={aiSummary.affirmative} />
                <SideSummary label="Negative case" summary={aiSummary.negative} />
              </section>

              <article className="app-card">
                <h2 className="card-title">Central clashes</h2>
                <div className="list" style={{ marginTop: "1rem" }}>
                  {aiSummary.clashes.length > 0 ? aiSummary.clashes.map((clash, index) => (
                    <div className="list-item" key={`${clash.topic}-${index}`}>
                      <strong>{clash.topic}</strong>
                      <span className="meta-line"><b>Aff:</b> {clash.affirmativePosition}</span>
                      <span className="meta-line"><b>Neg:</b> {clash.negativePosition}</span>
                      <span className="meta-line">{clash.neutralAssessment}</span>
                    </div>
                  )) : <EmptySummaryList />}
                </div>
              </article>

              <article className="app-card">
                <h2 className="card-title">Neutral outcome</h2>
                <p className="card-copy">{aiSummary.neutralOutcome.reasoning}</p>
                {aiSummary.neutralOutcome.unresolvedQuestions.length > 0 ? (
                  <>
                    <strong>Still unresolved</strong>
                    <ul>
                      {aiSummary.neutralOutcome.unresolvedQuestions.map((question, index) => (
                        <li key={`${question}-${index}`}>{question}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </article>
            </>
          ) : null}

          <article className="app-card">
            <h2 className="card-title">Speech highlights</h2>
            <div className="list" style={{ marginTop: "1rem" }}>
              {aiSummary?.speechHighlights.length ? aiSummary.speechHighlights.map((highlight) => (
                <div key={highlight.turnId} className="list-item">
                  <strong>{highlight.speaker} · {highlight.side}</strong>
                  <span className="meta-line">{highlight.highlight}</span>
                </div>
              )) : submittedTurns.length > 0 ? submittedTurns.map((turn) => (
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
