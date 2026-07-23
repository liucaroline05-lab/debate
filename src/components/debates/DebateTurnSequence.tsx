import { Check, Clock3, Lock, Mic2, Play } from "lucide-react";
import { formatDateTime } from "@/lib/date";
import type { DebateThread, DebateTurn } from "@/types/models";

const turnLabelsByFormat: Record<
  string,
  Array<{ code: string; title: string; side: "Aff" | "Neg" }>
> = {
  "Lincoln-Douglas": [
    { code: "AC", title: "Affirmative Constructive", side: "Aff" },
    { code: "NC", title: "Negative Constructive", side: "Neg" },
    { code: "1AR", title: "First Affirmative Rebuttal", side: "Aff" },
    { code: "NR", title: "Negative Rebuttal", side: "Neg" },
    { code: "2AR", title: "Second Affirmative Rebuttal", side: "Aff" },
  ],
  "Public Forum": [
    { code: "A1", title: "Affirmative Constructive", side: "Aff" },
    { code: "N1", title: "Negative Constructive", side: "Neg" },
    { code: "A2", title: "Affirmative Rebuttal", side: "Aff" },
    { code: "N2", title: "Negative Rebuttal", side: "Neg" },
    { code: "AS", title: "Affirmative Summary", side: "Aff" },
    { code: "NS", title: "Negative Summary", side: "Neg" },
    { code: "AFF", title: "Affirmative Final Focus", side: "Aff" },
    { code: "NFF", title: "Negative Final Focus", side: "Neg" },
  ],
  Policy: [
    { code: "1AC", title: "First Affirmative Constructive", side: "Aff" },
    { code: "1NC", title: "First Negative Constructive", side: "Neg" },
    { code: "2AC", title: "Second Affirmative Constructive", side: "Aff" },
    { code: "2NC", title: "Second Negative Constructive", side: "Neg" },
    { code: "1NR", title: "First Negative Rebuttal", side: "Neg" },
    { code: "1AR", title: "First Affirmative Rebuttal", side: "Aff" },
    { code: "2NR", title: "Second Negative Rebuttal", side: "Neg" },
    { code: "2AR", title: "Second Affirmative Rebuttal", side: "Aff" },
  ],
  "World Schools": [
    { code: "A1", title: "First Proposition Speech", side: "Aff" },
    { code: "N1", title: "First Opposition Speech", side: "Neg" },
    { code: "A2", title: "Second Proposition Speech", side: "Aff" },
    { code: "N2", title: "Second Opposition Speech", side: "Neg" },
    { code: "A3", title: "Third Proposition Speech", side: "Aff" },
    { code: "N3", title: "Third Opposition Speech", side: "Neg" },
    { code: "NR", title: "Opposition Reply", side: "Neg" },
    { code: "AR", title: "Proposition Reply", side: "Aff" },
  ],
};

const defaultTurnLabels = [
  { code: "1AC", title: "Affirmative Constructive", side: "Aff" as const },
  { code: "1NC", title: "Negative Constructive", side: "Neg" as const },
  { code: "1AR", title: "Affirmative Rebuttal", side: "Aff" as const },
  { code: "2NR", title: "Negative Rebuttal", side: "Neg" as const },
];

const turnLabel = (format: string, index: number, turn?: DebateTurn) => {
  const fallback = turnLabelsByFormat[format]?.[index]
    ?? defaultTurnLabels[index]
    ?? {
      code: `${Math.floor(index / 2) + 1}${index % 2 === 0 ? "A" : "N"}`,
      title: `${index % 2 === 0 ? "Affirmative" : "Negative"} Speech`,
      side: index % 2 === 0 ? ("Aff" as const) : ("Neg" as const),
    };

  return {
    code: turn?.code ?? fallback.code,
    title: turn?.title ?? fallback.title,
    side: turn?.side ?? fallback.side,
  };
};

interface DebateTurnSequenceProps {
  debate: DebateThread;
  currentUserId?: string;
  busy?: boolean;
  onUpload?: (file: File | undefined) => void;
}

export const DebateTurnSequence = ({
  debate,
  currentUserId,
  busy = false,
  onUpload,
}: DebateTurnSequenceProps) => {
  if (debate.status === "Awaiting Opponent") {
    return (
      <div className="debate-awaiting-card">
        <div className="debate-awaiting-icon"><Clock3 size={20} /></div>
        <div>
          <strong>Waiting for an opponent to join</strong>
          <span className="meta-line">
            {debate.inviteCode
              ? <>Share invite code <strong>{debate.inviteCode}</strong></>
              : "Your challenge is ready to be accepted."}
          </span>
        </div>
      </div>
    );
  }

  if (debate.status === "Completed" && (debate.turns?.length ?? 0) === 0) {
    return (
      <div className="debate-completed-summary">
        <Check size={20} />
        <div>
          <strong>All speeches submitted</strong>
          <span className="meta-line">
            {debate.winner
              ? `${debate.winner === "Aff" ? "Affirmative" : "Negative"} won this debate.`
              : "This debate is ready to review."}
          </span>
        </div>
      </div>
    );
  }

  const visibleTurnCount = debate.status === "Completed"
    ? debate.turns.length
    : Math.max(debate.totalRounds, debate.turns?.length ?? 0);

  return (
    <div className="debate-entry-turns" aria-label="Debate speech sequence">
      {Array.from({ length: visibleTurnCount }, (_, index) => {
        const turn = debate.turns?.[index];
        const label = turnLabel(debate.format, index, turn);
        const isSubmitted = Boolean(turn);
        const isCurrent =
          !isSubmitted
          && debate.status === "Active"
          && index === (debate.turns?.length ?? 0);
        const isCurrentUser =
          isCurrent
          && Boolean(currentUserId)
          && debate.currentTurnUserId === currentUserId;
        const sideClass = label.side === "Aff" ? "is-aff" : "is-neg";

        return (
          <div
            key={turn?.id ?? `${debate.id}-turn-${index}`}
            className={`debate-entry-turn ${sideClass}${isCurrent ? " is-current" : ""}${!isSubmitted && !isCurrent ? " is-locked" : ""}`}
          >
            <span className={`turn-badge ${sideClass}`}>{label.side.toUpperCase()}</span>
            <div className="turn-main">
              <strong><span className="turn-code">{label.code}</span> — {label.title}</strong>
              {turn ? (
                <span className="meta-line">
                  {turn.durationLabel ? `${turn.durationLabel} · ` : ""}
                  {turn.submittedAt
                    ? `Submitted ${formatDateTime(turn.submittedAt)}`
                    : turn.summary}
                </span>
              ) : isCurrentUser ? (
                <span className="meta-line is-current-copy">
                  Your turn to respond · {debate.speechTimeLimit ?? "5 minutes"} time limit
                </span>
              ) : isCurrent ? (
                <span className="meta-line">
                  Waiting for {label.side === "Aff"
                    ? debate.affirmative.name
                    : debate.negative.name} to submit
                </span>
              ) : (
                <span className="meta-line">
                  Unlocks after the previous speech is submitted
                </span>
              )}
            </div>
            <div className="turn-actions">
              {turn?.speechUrl ? (
                <a
                  className={`debate-play-button ${sideClass}`}
                  href={turn.speechUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Play ${label.title}`}
                >
                  <Play size={17} fill="currentColor" />
                </a>
              ) : isCurrentUser && onUpload ? (
                <label className="btn btn-primary debate-upload debate-record-button">
                  <Mic2 size={16} /> {busy ? "Uploading..." : "Record / Upload"}
                  <input
                    type="file"
                    accept="audio/*,video/*"
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      onUpload(file);
                    }}
                  />
                </label>
              ) : !isSubmitted ? (
                <Lock
                  className="debate-lock-icon"
                  size={18}
                  aria-label={isCurrent ? "Waiting" : "Locked"}
                />
              ) : null}
              {isSubmitted ? (
                <span className="debate-submitted-badge">
                  <Check size={14} /> Submitted
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};
