import type { DebateThread, PerformancePoint } from "@/types/models";

type DebateSide = "Aff" | "Neg";
type DebateResultSource = Pick<DebateThread, "status" | "winner" | "communityVoteCounts">;

export interface DebateVoteSummary {
  aff: number;
  neg: number;
  total: number;
  /** The side ahead on community votes, the official winner, or a tie. */
  leader: DebateSide | "Tie" | null;
  /** True when the leader comes from community votes rather than `winner`. */
  fromVotes: boolean;
}

/**
 * Community votes on completed public debates decide the result. An official
 * `winner` is only used while a debate has no votes yet.
 */
export const getDebateVoteSummary = (debate: DebateResultSource): DebateVoteSummary => {
  const aff = Math.max(0, debate.communityVoteCounts?.aff ?? 0);
  const neg = Math.max(0, debate.communityVoteCounts?.neg ?? 0);
  const total = aff + neg;
  if (total > 0) {
    return { aff, neg, total, leader: aff === neg ? "Tie" : aff > neg ? "Aff" : "Neg", fromVotes: true };
  }
  return { aff, neg, total, leader: debate.winner ?? null, fromVotes: false };
};

export const debateLeaderLabel = (summary: DebateVoteSummary) => {
  if (summary.leader === "Aff") return "AFF WINS";
  if (summary.leader === "Neg") return "NEG WINS";
  if (summary.leader === "Tie") return "TIED";
  return "NO VOTES YET";
};

export const getUserDebateSide = (
  debate: Pick<DebateThread, "affirmative" | "negative">,
  userId: string,
): DebateSide | null => {
  if (debate.affirmative?.userId === userId) return "Aff";
  if (debate.negative?.userId === userId) return "Neg";
  return null;
};

export interface UserDebateResult {
  debate: DebateThread;
  side: DebateSide;
  outcome: "win" | "loss" | "tie";
  /** Share of community votes for the user's side, 0–100; null without votes. */
  voteShare: number | null;
}

export const getUserDebateResult = (debate: DebateThread, userId: string): UserDebateResult | null => {
  if (debate.status !== "Completed") return null;
  const side = getUserDebateSide(debate, userId);
  if (!side) return null;
  const summary = getDebateVoteSummary(debate);
  if (!summary.leader) return null;
  const votesFor = side === "Aff" ? summary.aff : summary.neg;
  return {
    debate,
    side,
    outcome: summary.leader === "Tie" ? "tie" : summary.leader === side ? "win" : "loss",
    voteShare: summary.total ? Math.round((votesFor / summary.total) * 100) : null,
  };
};

export interface DebatePerformance {
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
  averageVoteShare: number | null;
  results: UserDebateResult[];
  /** Wins and losses per month, oldest first. */
  overTime: PerformancePoint[];
  /** Average vote share per format. */
  byFormat: PerformancePoint[];
}

const resultDate = (debate: DebateThread) => debate.updatedAt ?? debate.createdAt ?? debate.nextDeadline;

const average = (values: number[]) =>
  values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

export const summarizeDebatePerformance = (debates: DebateThread[], userId: string): DebatePerformance => {
  const results = debates
    .map((debate) => getUserDebateResult(debate, userId))
    .filter((result): result is UserDebateResult => Boolean(result))
    .sort((left, right) => (resultDate(left.debate) ?? "").localeCompare(resultDate(right.debate) ?? ""));

  const wins = results.filter((result) => result.outcome === "win").length;
  const losses = results.filter((result) => result.outcome === "loss").length;
  const ties = results.length - wins - losses;
  const voteShares = results.flatMap((result) => result.voteShare === null ? [] : [result.voteShare]);

  const months = new Map<string, { label: string; wins: number; losses: number; shares: number[] }>();
  results.forEach((result) => {
    const date = new Date(resultDate(result.debate) ?? "");
    const valid = !Number.isNaN(date.getTime());
    const key = valid ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "unknown";
    const label = valid ? date.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "Undated";
    const month = months.get(key) ?? { label, wins: 0, losses: 0, shares: [] };
    if (result.outcome === "win") month.wins += 1;
    if (result.outcome === "loss") month.losses += 1;
    if (result.voteShare !== null) month.shares.push(result.voteShare);
    months.set(key, month);
  });

  const formats = new Map<string, number[]>();
  results.forEach((result) => {
    if (result.voteShare === null) return;
    const format = result.debate.format || "Other";
    formats.set(format, [...(formats.get(format) ?? []), result.voteShare]);
  });

  return {
    wins,
    losses,
    ties,
    winRate: wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0,
    averageVoteShare: average(voteShares),
    results,
    overTime: [...months.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, month]) => ({ label: month.label, score: average(month.shares) ?? 0, wins: month.wins, losses: month.losses })),
    byFormat: [...formats.entries()]
      .map(([label, shares]) => ({ label, score: average(shares) ?? 0 }))
      .sort((left, right) => right.score - left.score),
  };
};
