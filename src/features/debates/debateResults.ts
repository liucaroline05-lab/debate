import type { DebateThread } from "@/types/models";

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

/** Results grouped by month, side, or format. Rates are 0–100. */
export interface PerformanceGroup {
  label: string;
  wins: number;
  losses: number;
  ties: number;
  /** Wins over decided debates; null when every debate in the group tied. */
  winRate: number | null;
  /** Average share of community votes; null when no votes were cast. */
  voteShare: number | null;
}

export interface DebatePerformance {
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
  averageVoteShare: number | null;
  results: UserDebateResult[];
  /** One group per month, oldest first. */
  overTime: PerformanceGroup[];
  /** Affirmative and Negative, for sides the user has debated. */
  bySide: PerformanceGroup[];
  /** One group per format, strongest vote share first. */
  byFormat: PerformanceGroup[];
}

const resultDate = (debate: DebateThread) => debate.updatedAt ?? debate.createdAt ?? debate.nextDeadline;

const average = (values: number[]) =>
  values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

const summarizeGroup = (label: string, results: UserDebateResult[]): PerformanceGroup => {
  const wins = results.filter((result) => result.outcome === "win").length;
  const losses = results.filter((result) => result.outcome === "loss").length;
  return {
    label,
    wins,
    losses,
    ties: results.length - wins - losses,
    winRate: wins + losses ? Math.round((wins / (wins + losses)) * 100) : null,
    voteShare: average(results.flatMap((result) => result.voteShare === null ? [] : [result.voteShare])),
  };
};

const groupResults = (results: UserDebateResult[], keyOf: (result: UserDebateResult) => string) => {
  const groups = new Map<string, UserDebateResult[]>();
  results.forEach((result) => {
    const key = keyOf(result);
    groups.set(key, [...(groups.get(key) ?? []), result]);
  });
  return groups;
};

const monthKey = (result: UserDebateResult) => {
  const date = new Date(resultDate(result.debate) ?? "");
  return Number.isNaN(date.getTime())
    ? "undated"
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (key: string) => {
  if (key === "undated") return "Undated";
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

export const summarizeDebatePerformance = (debates: DebateThread[], userId: string): DebatePerformance => {
  const results = debates
    .map((debate) => getUserDebateResult(debate, userId))
    .filter((result): result is UserDebateResult => Boolean(result))
    .sort((left, right) => (resultDate(left.debate) ?? "").localeCompare(resultDate(right.debate) ?? ""));
  const overall = summarizeGroup("All debates", results);

  return {
    wins: overall.wins,
    losses: overall.losses,
    ties: overall.ties,
    winRate: overall.winRate ?? 0,
    averageVoteShare: overall.voteShare,
    results,
    overTime: [...groupResults(results, monthKey).entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, group]) => summarizeGroup(monthLabel(key), group)),
    bySide: (["Aff", "Neg"] as const).flatMap((side) => {
      const group = results.filter((result) => result.side === side);
      return group.length ? [summarizeGroup(side === "Aff" ? "Affirmative" : "Negative", group)] : [];
    }),
    byFormat: [...groupResults(results, (result) => result.debate.format || "Other").entries()]
      .map(([format, group]) => summarizeGroup(format, group))
      .sort((left, right) => (right.voteShare ?? -1) - (left.voteShare ?? -1)),
  };
};
