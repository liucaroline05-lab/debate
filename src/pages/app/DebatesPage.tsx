import { useMemo, useState } from "react";
import { PageMeta } from "@/components/common/PageMeta";
import { debateThreads, matchRequests } from "@/data/mockData";
import { useFirebaseCollection } from "@/hooks/useFirebaseCollection";
import { formatDate, formatDateTime } from "@/lib/date";
import type { DebateThread, DebateTurn } from "@/types/models";

type DebateTab = "my-debates" | "open-challenges" | "completed" | "spectate";

const tabs: Array<{ id: DebateTab; label: string }> = [
  { id: "my-debates", label: "My Debates" },
  { id: "open-challenges", label: "Open Challenges" },
  { id: "completed", label: "Completed" },
  { id: "spectate", label: "Spectate" },
];

const sideLabel = (side: DebateTurn["side"]) =>
  side === "Aff" ? "Affirmative" : "Negative";

const turnCardClass = (turn: DebateTurn) => {
  if (turn.status === "locked") {
    return "debate-turn-card is-locked";
  }

  if (turn.status === "current") {
    return `debate-turn-card is-current is-${turn.side.toLowerCase()}`;
  }

  return `debate-turn-card is-${turn.side.toLowerCase()}`;
};

const roundSummary = (debate: DebateThread) =>
  `Round ${debate.currentRound} of ${debate.totalRounds}`;

export const DebatesPage = () => {
  const [activeTab, setActiveTab] = useState<DebateTab>("my-debates");
  const debateState = useFirebaseCollection("debates", debateThreads);
  const matchState = useFirebaseCollection("matchRequests", matchRequests);

  const myDebates = useMemo(
    () => debateState.data.filter((debate) => debate.lane === "my-debates"),
    [debateState.data],
  );
  const completedDebates = useMemo(
    () => debateState.data.filter((debate) => debate.lane === "completed"),
    [debateState.data],
  );
  const spectateDebates = useMemo(
    () => debateState.data.filter((debate) => debate.lane === "spectate"),
    [debateState.data],
  );

  return (
    <>
      <PageMeta
        title="Async Debate"
        description="Challenge opponents, track each round, and move through async debates with clearer structure."
      />

      <header className="route-header">
        <div className="row-between">
          <div>
            <p className="eyebrow">Async Debate</p>
            <h1>Challenge opponents and debate round by round.</h1>
            <p>
              A more structured async board for active rounds, open challenges,
              completed decisions, and spectator-friendly viewing.
            </p>
          </div>
          <button type="button" className="btn btn-primary">
            + New Debate
          </button>
        </div>
      </header>

      <div className="debate-tabs" role="tablist" aria-label="Async debate sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "debate-tab is-active" : "debate-tab"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "my-debates" ? (
        <section className="stack">
          {myDebates.map((debate) => (
            <article key={debate.id} className="debate-panel">
              <div className="debate-panel-header">
                <div className="cluster">
                  <span className="debate-dot is-live" />
                  <h2 className="debate-topic">{debate.topic}</h2>
                  <span className="pill debate-format-pill">{debate.format}</span>
                </div>
                <div className="cluster">
                  <span className="debate-status-badge is-current">
                    {debate.status === "Waiting on You" ? "Your Turn — Reply" : "Waiting"}
                  </span>
                  <span className="meta-line">{roundSummary(debate)}</span>
                </div>
              </div>

              <div className="debate-matchup">
                <div className="debater-card">
                  <div className="debater-avatar">{debate.affirmative.name.charAt(0)}</div>
                  <div>
                    <strong>
                      {debate.affirmative.name}
                      {debate.affirmative.partnerLabel ? ` ${debate.affirmative.partnerLabel}` : ""}
                    </strong>
                    <span className="debater-side is-aff">{debate.affirmative.label}</span>
                  </div>
                </div>
                <div className="debate-vs">VS</div>
                <div className="debater-card is-right">
                  <div>
                    <strong>
                      {debate.negative.name}
                      {debate.negative.partnerLabel ? ` ${debate.negative.partnerLabel}` : ""}
                    </strong>
                    <span className="debater-side is-neg">{debate.negative.label}</span>
                  </div>
                  <div className="debater-avatar is-neg">{debate.negative.name.charAt(0)}</div>
                </div>
              </div>

              <div className="debate-turn-list">
                {debate.turns.map((turn) => (
                  <div key={turn.id} className={turnCardClass(turn)}>
                    <div className={`turn-badge is-${turn.side.toLowerCase()}`}>{turn.code ?? turn.side}</div>
                    <div className="turn-main">
                      <strong>
                        {turn.code ? `${turn.code} — ` : ""}
                        {turn.title ?? sideLabel(turn.side)}
                      </strong>
                      <span className="meta-line">
                        {turn.author}
                        {turn.durationLabel ? ` • ${turn.durationLabel}` : ""}
                        {turn.submittedAt ? ` • ${formatDateTime(turn.submittedAt)}` : ""}
                      </span>
                      <span className="helper-line">{turn.summary}</span>
                    </div>
                    <div className="turn-actions">
                      {turn.status === "submitted" ? (
                        <span className="debate-status-badge is-submitted">Submitted</span>
                      ) : null}
                      {turn.status === "current" ? (
                        <button type="button" className="btn btn-primary">
                          {turn.actionLabel ?? "Respond"}
                        </button>
                      ) : null}
                      {turn.status === "locked" ? (
                        <span className="debate-lock" aria-hidden="true">
                          Lock
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <div className="debate-panel-footer">
                <div className="inline-list">
                  <span className="meta-line">Deadline: {formatDateTime(debate.nextDeadline)}</span>
                  <span className="meta-line">{debate.spectators} spectators</span>
                </div>
                <div className="button-row">
                  <button type="button" className="btn btn-ghost">
                    Invite Spectators
                  </button>
                  <button type="button" className="btn btn-secondary">
                    View AI Judging
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {activeTab === "open-challenges" ? (
        <section className="stack">
          {matchState.data.map((match) => (
            <article key={match.id} className="debate-panel is-challenge">
              <div className="debate-panel-header">
                <div className="cluster">
                  <span className="debate-dot is-warm" />
                  <h2 className="debate-topic">{match.topic}</h2>
                  <span className="pill debate-format-pill">{match.format}</span>
                </div>
                <span className="debate-status-badge is-open">Open Challenge</span>
              </div>

              <div className="challenge-body">
                <div className="debater-card">
                  <div className="debater-avatar">{match.requestedBy.charAt(0)}</div>
                  <div>
                    <strong>{match.requestedBy}</strong>
                    <span className="meta-line">
                      Wants to debate as <span className="debater-side is-aff">{match.requesterSideLabel ?? match.preferredSide}</span>
                    </span>
                  </div>
                </div>

                <div className="challenge-meta">
                  <strong>{match.requesterGoal ?? "Looking for a partner"}</strong>
                  <span className="meta-line">
                    {match.rounds ?? 4} rounds • {match.responseWindowHours ?? 48}h per round
                  </span>
                </div>

                <div className="challenge-actions">
                  <button type="button" className="btn btn-primary">
                    Accept Challenge
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {activeTab === "completed" ? (
        <section className="stack">
          {completedDebates.map((debate) => (
            <article key={debate.id} className="debate-panel">
              <div className="debate-panel-header">
                <div className="cluster">
                  <span className="debate-dot" />
                  <h2 className="debate-topic">{debate.topic}</h2>
                  <span className="pill debate-format-pill">{debate.format}</span>
                </div>
                <span className="debate-status-badge is-complete">
                  Completed {debate.aiJudged ? "• AI Judged" : ""}
                </span>
              </div>

              <div className="debate-scoreboard">
                <div className="debater-card">
                  <div className="debater-avatar">{debate.affirmative.name.charAt(0)}</div>
                  <div>
                    <strong>
                      {debate.affirmative.name}
                      {debate.affirmative.partnerLabel ? ` ${debate.affirmative.partnerLabel}` : ""}
                    </strong>
                    <span className="debater-side is-aff">{debate.affirmative.label}</span>
                  </div>
                </div>

                <div className="score-pill">
                  <strong className="score aff">{debate.score?.aff ?? "--"}</strong>
                  <span className="score-winner">
                    {debate.winner === "Aff" ? "AFF WINS" : "NEG WINS"}
                  </span>
                  <strong className="score neg">{debate.score?.neg ?? "--"}</strong>
                </div>

                <div className="debater-card is-right">
                  <div>
                    <strong>
                      {debate.negative.name}
                      {debate.negative.partnerLabel ? ` ${debate.negative.partnerLabel}` : ""}
                    </strong>
                    <span className="debater-side is-neg">{debate.negative.label}</span>
                  </div>
                  <div className="debater-avatar is-neg">{debate.negative.name.charAt(0)}</div>
                </div>
              </div>

              <div className="debate-panel-footer">
                <div className="inline-list">
                  <span className="meta-line">
                    {debate.totalRounds} rounds • {formatDate(debate.turns[0]?.submittedAt ?? debate.nextDeadline)}-{" "}
                    {formatDate(debate.nextDeadline)} • {debate.spectators} spectators
                  </span>
                </div>
                <button type="button" className="btn btn-secondary">
                  View Full AI Judgment
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {activeTab === "spectate" ? (
        <section className="stack">
          {spectateDebates.length > 0 ? (
            spectateDebates.map((debate) => (
              <article key={debate.id} className="debate-panel is-spectate">
                <div className="debate-panel-header">
                  <div className="cluster">
                    <span className="debate-dot is-sage" />
                    <h2 className="debate-topic">{debate.topic}</h2>
                    <span className="pill debate-format-pill">{debate.format}</span>
                  </div>
                  <span className="debate-status-badge">{debate.spectators} watching</span>
                </div>

                <div className="debate-matchup compact">
                  <div className="debater-card">
                    <div className="debater-avatar">{debate.affirmative.name.charAt(0)}</div>
                    <div>
                      <strong>{debate.affirmative.name}</strong>
                      <span className="debater-side is-aff">{debate.affirmative.label}</span>
                    </div>
                  </div>
                  <div className="debate-vs">LIVE</div>
                  <div className="debater-card is-right">
                    <div>
                      <strong>{debate.negative.name}</strong>
                      <span className="debater-side is-neg">{debate.negative.label}</span>
                    </div>
                    <div className="debater-avatar is-neg">{debate.negative.name.charAt(0)}</div>
                  </div>
                </div>

                <div className="debate-panel-footer">
                  <span className="meta-line">
                    {roundSummary(debate)} • Next deadline {formatDateTime(debate.nextDeadline)}
                  </span>
                  <button type="button" className="btn btn-secondary">
                    Watch Debate
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <h2 className="card-title">No spectator debates yet</h2>
              <p className="card-copy">
                When shared rounds open for viewing, they will appear here with
                live progress and judging context.
              </p>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
};
