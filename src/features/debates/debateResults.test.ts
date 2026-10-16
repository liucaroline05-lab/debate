import {
  debateLeaderLabel,
  getDebateVoteSummary,
  getUserDebateResult,
  summarizeDebatePerformance,
} from "@/features/debates/debateResults";
import type { DebateThread } from "@/types/models";

const debate = (overrides: Partial<DebateThread>): DebateThread => ({
  id: "debate",
  topic: "Resolved",
  format: "Public Forum",
  status: "Completed",
  visibility: "public",
  nextDeadline: "2026-09-10T00:00:00.000Z",
  updatedAt: "2026-09-10T00:00:00.000Z",
  affirmative: { name: "Avery", side: "Aff", label: "Affirmative", userId: "avery" },
  negative: { name: "Blake", side: "Neg", label: "Negative", userId: "blake" },
  participantIds: ["avery", "blake"],
  currentRound: 4,
  totalRounds: 4,
  turns: [],
  ...overrides,
} as DebateThread);

describe("debate vote results", () => {
  it("uses community votes ahead of an official winner", () => {
    const summary = getDebateVoteSummary(debate({ winner: "Aff", communityVoteCounts: { aff: 2, neg: 5 } }));
    expect(summary).toMatchObject({ aff: 2, neg: 5, total: 7, leader: "Neg", fromVotes: true });
    expect(debateLeaderLabel(summary)).toBe("NEG WINS");
  });

  it("falls back to the official winner, then to no result", () => {
    expect(getDebateVoteSummary(debate({ winner: "Aff" })).leader).toBe("Aff");
    const empty = getDebateVoteSummary(debate({}));
    expect(empty.leader).toBeNull();
    expect(debateLeaderLabel(empty)).toBe("NO VOTES YET");
    expect(debateLeaderLabel(getDebateVoteSummary(debate({ communityVoteCounts: { aff: 3, neg: 3 } })))).toBe("TIED");
  });

  it("scores each participant from their side", () => {
    const voted = debate({ communityVoteCounts: { aff: 3, neg: 1 } });
    expect(getUserDebateResult(voted, "avery")).toMatchObject({ side: "Aff", outcome: "win", voteShare: 75 });
    expect(getUserDebateResult(voted, "blake")).toMatchObject({ side: "Neg", outcome: "loss", voteShare: 25 });
    expect(getUserDebateResult(voted, "spectator")).toBeNull();
    expect(getUserDebateResult({ ...voted, status: "Active" }, "avery")).toBeNull();
  });

  it("summarizes a record, monthly results, and vote share by format", () => {
    const performance = summarizeDebatePerformance([
      debate({ id: "a", updatedAt: "2026-08-02T00:00:00.000Z", communityVoteCounts: { aff: 4, neg: 1 } }),
      debate({ id: "b", updatedAt: "2026-09-05T00:00:00.000Z", format: "Lincoln-Douglas", communityVoteCounts: { aff: 1, neg: 3 } }),
      debate({ id: "c", updatedAt: "2026-09-20T00:00:00.000Z", communityVoteCounts: { aff: 2, neg: 2 } }),
      debate({ id: "d", status: "Active", communityVoteCounts: { aff: 9, neg: 0 } }),
    ], "avery");

    expect(performance).toMatchObject({ wins: 1, losses: 1, ties: 1, winRate: 50, averageVoteShare: 52 });
    expect(performance.overTime).toEqual([
      { label: "Aug 2026", score: 80, wins: 1, losses: 0 },
      { label: "Sep 2026", score: 38, wins: 0, losses: 1 },
    ]);
    expect(performance.byFormat).toEqual([
      { label: "Public Forum", score: 65 },
      { label: "Lincoln-Douglas", score: 25 },
    ]);
  });
});
