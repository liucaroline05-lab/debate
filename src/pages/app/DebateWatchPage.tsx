import { useEffect, useMemo, useState } from "react";
import { where, type QueryConstraint } from "firebase/firestore";
import { Link, useLocation, useParams } from "react-router-dom";
import { PageMeta } from "@/components/common/PageMeta";
import { DebateTurnSequence } from "@/components/debates/DebateTurnSequence";
import { seededDebates } from "@/data/firestoreSeeds";
import { useAuth } from "@/features/auth/AuthContext";
import { voteForDebateWinner } from "@/features/debates/debateService";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type {
  DebateSideSummary,
  DebateSummaryStatus,
  DebateWinnerVote,
} from "@/types/models";

const EMPTY_WINNER_VOTES: DebateWinnerVote[] = [];

const summaryStatusCopy: Record<DebateSummaryStatus, string> = {
  waiting_for_transcripts:
    "The debate is complete. Its recordings are still being transcribed.",
  processing: "The transcripts are ready and the debate summary is being prepared.",
  completed: "The debate summary is ready.",
  failed:
    "The AI summary could not be generated. An administrator can check the function logs and retry processing.",
};

const safeInitial = (value?: string | null) =>
  value?.trim()?.charAt(0).toUpperCase() || "D";

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
  const { currentUser } = useAuth();
  const [voteBusy, setVoteBusy] = useState(false);
  const [voteError, setVoteError] = useState("");
  const [selectedVoteSide, setSelectedVoteSide] = useState<"Aff" | "Neg" | null>(null);
  const debatesState = useSeededFirestoreCollection("debates", seededDebates);
  const voteConstraints = useMemo<QueryConstraint[]>(
    () => currentUser ? [where("userId", "==", currentUser.id)] : [],
    [currentUser],
  );
  const votesState = useSeededFirestoreCollection<DebateWinnerVote>(
    "debateWinnerVotes",
    EMPTY_WINNER_VOTES,
    voteConstraints,
    Boolean(currentUser),
    currentUser ? `debate-winner-votes:${currentUser.id}` : undefined,
  );

  const debate = useMemo(
    () => debatesState.data.find((entry) => entry.id === debateId),
    [debateId, debatesState.data],
  );
  const persistedVote = useMemo(
    () => votesState.data.find((vote) => vote.debateId === debateId),
    [debateId, votesState.data],
  );

  useEffect(() => {
    setSelectedVoteSide(null);
    setVoteError("");
  }, [debateId]);

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
  const isParticipant = Boolean(
    currentUser
    && (
      (debate.participantIds ?? []).includes(currentUser.id)
      || debate.affirmative.userId === currentUser.id
      || debate.negative.userId === currentUser.id
    ),
  );
  const canVote =
    Boolean(currentUser)
    && debate.status === "Completed"
    && debate.visibility === "public"
    && !isParticipant;
  const selectedVote = selectedVoteSide ?? persistedVote?.side;
  const voteCounts = debate.communityVoteCounts ?? { aff: 0, neg: 0 };
  const totalCommunityVotes = voteCounts.aff + voteCounts.neg;

  const handleWinnerVote = async (side: "Aff" | "Neg") => {
    if (!currentUser || !canVote || voteBusy || selectedVote === side) {
      return;
    }

    const previousSide = selectedVote ?? null;
    setSelectedVoteSide(side);
    setVoteError("");
    setVoteBusy(true);

    try {
      await voteForDebateWinner(debate.id, currentUser.id, side);
    } catch (error) {
      setSelectedVoteSide(previousSide);
      setVoteError(
        error instanceof Error ? error.message : "Your vote could not be saved.",
      );
    } finally {
      setVoteBusy(false);
    }
  };

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
        <section className="stack">
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

          <article
            className="debate-panel"
            aria-label={debate.status === "Completed" ? "Completed debate round" : "Debate round"}
          >
            <div className="debate-panel-header">
              <div className="cluster">
                <span className="debate-dot" />
                <h2 className="debate-topic">{debate.topic}</h2>
                <span className="pill debate-format-pill">{debate.format}</span>
              </div>
              <div className="debate-entry-status">
                <span className="debate-status-badge is-complete">{debate.status}</span>
                <span className="meta-line">
                  {submittedTurns.length} of {debate.totalRounds} speeches
                </span>
              </div>
            </div>

            <div className="debate-scoreboard debate-review-scoreboard">
              <div className="debate-vote-side is-aff">
                <div className="debater-card">
                  <div className="debater-avatar">{safeInitial(debate.affirmative.name)}</div>
                  <div>
                    <strong>{debate.affirmative.name}</strong>
                    <span className="debater-side is-aff">{debate.affirmative.label}</span>
                  </div>
                </div>
                {canVote ? (
                  <button
                    type="button"
                    className={`debate-winner-vote is-aff${selectedVote === "Aff" ? " is-selected" : ""}`}
                    aria-pressed={selectedVote === "Aff"}
                    disabled={voteBusy || selectedVote === "Aff"}
                    onClick={() => void handleWinnerVote("Aff")}
                  >
                    Vote {debate.affirmative.name}
                    <span>{voteCounts.aff} {voteCounts.aff === 1 ? "vote" : "votes"}</span>
                  </button>
                ) : null}
              </div>

              <div className="score-pill debate-final-marker">
                <strong className="score aff">{debate.score?.aff ?? "--"}</strong>
                <span className="score-winner">
                  {debate.winner === "Aff"
                    ? "AFF WINS"
                    : debate.winner === "Neg"
                      ? "NEG WINS"
                      : "FINAL"}
                </span>
                <strong className="score neg">{debate.score?.neg ?? "--"}</strong>
                <span className="meta-line">
                  {totalCommunityVotes} community {totalCommunityVotes === 1 ? "vote" : "votes"}
                </span>
              </div>

              <div className="debate-vote-side is-neg">
                <div className="debater-card is-right">
                  <div>
                    <strong>{debate.negative.name}</strong>
                    <span className="debater-side is-neg">{debate.negative.label}</span>
                  </div>
                  <div className="debater-avatar is-neg">{safeInitial(debate.negative.name)}</div>
                </div>
                {canVote ? (
                  <button
                    type="button"
                    className={`debate-winner-vote is-neg${selectedVote === "Neg" ? " is-selected" : ""}`}
                    aria-pressed={selectedVote === "Neg"}
                    disabled={voteBusy || selectedVote === "Neg"}
                    onClick={() => void handleWinnerVote("Neg")}
                  >
                    Vote {debate.negative.name}
                    <span>{voteCounts.neg} {voteCounts.neg === 1 ? "vote" : "votes"}</span>
                  </button>
                ) : null}
              </div>
            </div>

            {voteError ? (
              <p className="form-error debate-vote-error" role="alert">{voteError}</p>
            ) : null}

            <DebateTurnSequence debate={debate} />

            <div className="debate-entry-footer">
              <span className="meta-line">
                {submittedTurns.length} submitted • {debate.spectators} spectators
              </span>
              <Link
                className="btn btn-secondary"
                to={`/app/debates/${debate.id}?view=summary`}
              >
                View Summary
              </Link>
            </div>
          </article>
        </section>
      )}
    </>
  );
};
